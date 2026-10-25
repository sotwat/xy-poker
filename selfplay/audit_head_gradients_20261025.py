"""Frozen-copy head-gradient ablation; no live optimizer or replay writes."""
import collections
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
import torch

from train import PolicyValue, load_checkpoint, fingerprint


def losses(model, rows, mode='shared'):
    x = torch.stack([r['x'] for r in rows])
    pi = torch.stack([r['pi'] for r in rows])
    mask = torch.stack([r['mask'] for r in rows])
    z = torch.tensor([r['z'] for r in rows])
    h = model.body(x)
    logits = model.policy(h.detach() if mode == 'policy-head-only' else h)
    value = torch.tanh(model.value(h.detach() if mode == 'value-head-only' else h)).squeeze(-1)
    return (-(pi * logits.masked_fill(~mask, -1e9).log_softmax(1)).sum(1).mean(),
            ((value - z) ** 2).mean())


def metrics(model, rows):
    groups = {'all': rows}
    for row in rows:
        groups.setdefault(row['source'], []).append(row)
    result = {}
    with torch.no_grad():
        for name, group in groups.items():
            sums = np.zeros(2)
            for start in range(0, len(group), 128):
                batch = group[start:start + 128]
                sums += np.array([float(v) for v in losses(model, batch)]) * len(batch)
            result[name] = dict(n=len(group), policy_ce=sums[0] / len(group),
                                value_mse=sums[1] / len(group))
    return result


def candidate_gates(arms):
    reference = arms['shared']['confirm']
    return {mode: all(values[key] < reference[group][key]
                      for group, values in arm['confirm'].items()
                      if group == 'all' or group.startswith('teacher-')
                      for key in ('policy_ce', 'value_mse'))
            for mode, arm in arms.items() if mode != 'shared'}


def run(directory):
    torch.set_num_threads(1)
    checkpoint = directory / 'latest.pt'
    before_hash = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    saved = load_checkpoint(checkpoint)
    replay = saved['replay']
    events = [json.loads(line) for line in (directory / 'events.jsonl').read_text().splitlines()]
    events = [e for e in events if e.get('event') == 'selfplay'
              and e['total_games'] <= saved['total_games']]
    assert events[-1]['total_games'] == saved['total_games']
    cursor, quota, games = len(replay), collections.Counter(), []
    for e in reversed(events):
        start = cursor - e['samples']
        if start < 0:
            break
        rows = replay[start:cursor]
        cursor = start
        kind = e['opponent']
        if quota[kind] < 16:
            games.append((e, rows))
            quota[kind] += 1
        if len(games) == 64:
            break
    assert len(games) == 64 and sorted(quota.values()) == [16] * 4
    train, confirm, manifest, ordinals = [], [], [], collections.Counter()
    for e, rows in sorted(games, key=lambda item: item[0]['total_games']):
        kind = e['opponent']
        split = 'confirm' if ordinals[kind] % 4 == 3 else 'train'
        ordinals[kind] += 1
        (confirm if split == 'confirm' else train).extend(rows)
        manifest.append(dict(total_games=e['total_games'], seed=e['match']['seed'],
                             kind=kind, model_seat=e['match']['model_seat'],
                             split=split, rows=len(rows)))
    assert len({g['seed'] for g in manifest}) == 64
    base = PolicyValue(saved['config']['width']).eval()
    base.load_state_dict(saved['model'])
    rng = np.random.RandomState(100525077)
    batches = [rng.randint(len(train), size=64).tolist() for _ in range(32)]
    gradients = []
    shared = tuple(base.body.parameters())
    for indices in batches[:8]:
        p, v = losses(base, [train[i] for i in indices])
        gp = torch.cat([g.flatten() for g in torch.autograd.grad(p, shared, retain_graph=True)])
        gv = torch.cat([g.flatten() for g in torch.autograd.grad(v, shared, retain_graph=True)])
        joint = torch.cat([g.flatten() for g in torch.autograd.grad(p + v, shared)])
        assert torch.allclose(joint, gp + gv, atol=1e-6, rtol=1e-4)
        dot = float(gp.dot(gv))
        gradients.append(dict(dot=dot, policy_norm=float(gp.norm()), value_norm=float(gv.norm()),
                              cosine=dot / float(gp.norm() * gv.norm()),
                              joint_policy_direction=float(gp.dot(joint)),
                              joint_value_direction=float(gv.dot(joint))))
    before = dict(train=metrics(base, train), confirm=metrics(base, confirm))
    arms = {}
    for mode in ('shared', 'value-head-only', 'policy-head-only'):
        model = copy.deepcopy(base)
        optimizer = torch.optim.AdamW(model.parameters(), lr=saved['config']['learning_rate'],
                                      weight_decay=1e-4)
        optimizer.load_state_dict(copy.deepcopy(saved['optimizer']))
        for indices in batches:
            p, v = losses(model, [train[i] for i in indices], mode)
            loss = p + v
            assert torch.isfinite(loss)
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5)
            optimizer.step()
        arms[mode] = dict(train=metrics(model, train), confirm=metrics(model, confirm),
                          model_sha256=fingerprint(model))
    assert fingerprint(base) == saved['model_sha256']
    assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == before_hash
    return dict(checkpoint_sha256=before_hash, total_games=saved['total_games'],
                model_sha256=saved['model_sha256'], seed=100525077,
                protocol='Latest 16 complete games per curriculum kind; chronological every fourth '
                         'game reserved from local updates. Three predeclared arms, 32 identical '
                         '64-row batches, copied AdamW including moments; no live writes.',
                gate='Diagnostic candidate requires lower confirmation policy CE and value MSE '
                     'than shared, including every teacher-source group. No live adoption gate.',
                manifest=manifest, train_rows=len(train), confirm_rows=len(confirm),
                before=before, gradients=gradients, arms=arms, candidate_gates=candidate_gates(arms),
                limitations='All rows were already eligible for live training; confirmation is '
                            'held out only from these local updates, not independent strength data. '
                            'Game outcomes and sources are correlated. AdamW momentum/decay and '
                            'gradient clipping mean raw gradient dots do not establish update harm. '
                            'No matches, A9 calls, new deals or live training updates in this audit.')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(run(args.directory), indent=2) + '\n')
