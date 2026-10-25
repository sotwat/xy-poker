"""Separate teacher memorization from game-level transfer on frozen copies."""
import collections
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
import torch

from audit_head_gradients_20261025 import losses
from train import PolicyValue, load_checkpoint, fingerprint


def measure(model, rows):
    groups = {'all': rows}
    for row in rows:
        groups.setdefault(row['source'], []).append(row)
    result = {}
    with torch.no_grad():
        for key, group in groups.items():
            sums = np.zeros(6)
            for start in range(0, len(group), 128):
                batch = group[start:start + 128]
                x = torch.stack([r['x'] for r in batch])
                mask = torch.stack([r['mask'] for r in batch])
                target = torch.stack([r['pi'] for r in batch]).argmax(1)
                logits, values = model(x)
                logp = logits.masked_fill(~mask, -1e9).log_softmax(1)
                chosen = logp[torch.arange(len(batch)), target]
                rank = 1 + (logp > chosen[:, None]).sum(1)
                z = torch.tensor([r['z'] for r in batch])
                sums += np.array([float((-chosen).sum()), float(chosen.exp().sum()),
                                  int((logp.argmax(1) == target).sum()), int((rank <= 5).sum()),
                                  float(rank.sum()), float(((values - z) ** 2).sum())])
            result[key] = dict(n=len(group), **dict(zip(
                ('ce', 'teacher_probability', 'top1', 'top5', 'mean_rank', 'value_mse'),
                (sums / len(group)).tolist())))
    return result


def run(directory):
    torch.set_num_threads(1)
    path = directory / 'latest.pt'
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    saved = load_checkpoint(path)
    snapshot = directory.parent / 'diagnostic-teacher-fit-20261025' / 'checkpoint.pt'
    snapshot.parent.mkdir(exist_ok=True)
    if snapshot.exists():
        assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == digest
    else:
        snapshot.write_bytes(path.read_bytes())
    assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == digest
    events = [json.loads(line) for line in (directory / 'events.jsonl').read_text().splitlines()]
    events = [e for e in events if e.get('event') == 'selfplay'
              and e['total_games'] <= saved['total_games']]
    assert events[-1]['total_games'] == saved['total_games']
    cursor, games, quota = len(saved['replay']), [], collections.Counter()
    for event in reversed(events):
        start = cursor - event['samples']
        if start < 0:
            break
        rows = saved['replay'][start:cursor]
        cursor = start
        kind = event['opponent']
        if kind not in ('baseline', 'teacher-selfplay'):
            continue
        stratum = (kind, event['match']['model_seat'])
        limit = 16 if kind == 'teacher-selfplay' else 8
        if quota[stratum] < limit:
            games.append((event, rows))
            quota[stratum] += 1
        if len(games) == 32:
            break
    assert len(games) == 32 and sorted(quota.values()) == [8, 8, 16]
    train, confirm, manifest, ordinal = [], [], [], collections.Counter()
    for event, rows in sorted(games, key=lambda pair: pair[0]['total_games']):
        match = event['match']
        key = (event['opponent'], match['model_seat'])
        split = 'confirm' if ordinal[key] % 4 == 3 else 'train'
        ordinal[key] += 1
        assert all(r['source'].startswith('teacher-a9') for r in rows)
        assert all(float(r['pi'].max()) == float(r['pi'].sum()) == 1 for r in rows)
        (train if split == 'train' else confirm).extend(rows)
        manifest.append(dict(total_games=event['total_games'], seed=match['seed'],
                             kind=event['opponent'], model_seat=match['model_seat'],
                             split=split, rows=len(rows)))
    assert len({g['seed'] for g in manifest}) == 32
    model = PolicyValue(saved['config']['width']).eval()
    model.load_state_dict(saved['model'])
    optimizer = torch.optim.AdamW(model.parameters(), lr=saved['config']['learning_rate'], weight_decay=1e-4)
    optimizer.load_state_dict(copy.deepcopy(saved['optimizer']))
    original = fingerprint(model)
    rng = np.random.RandomState(100525078)
    results = [dict(updates=0, train=measure(model, train), confirm=measure(model, confirm))]
    value_head = {k: v.clone() for k, v in model.value.state_dict().items()}
    for step in range(1, 513):
        batch = [train[i] for i in rng.randint(len(train), size=64)]
        policy_loss, _ = losses(model, batch)
        assert torch.isfinite(policy_loss)
        optimizer.zero_grad()
        policy_loss.backward()
        assert all(p.grad is None for p in model.value.parameters())
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5)
        optimizer.step()
        if step in (32, 128, 512):
            results.append(dict(updates=step, train=measure(model, train),
                                confirm=measure(model, confirm), model_sha256=fingerprint(model)))
    assert all(torch.equal(v, value_head[k]) for k, v in model.value.state_dict().items())
    assert original == saved['model_sha256']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
    final = results[-1]
    return dict(checkpoint_sha256=digest, model_sha256=original, total_games=saved['total_games'],
                seed=100525078, manifest=manifest, train_rows=len(train), confirm_rows=len(confirm),
                protocol='Latest 16 expert-pair games and 8 baseline games per model seat; '
                         'every fourth within each stratum held out. Policy CE only, copied '
                         'weights and AdamW moments, 512 updates of batch64, checkpoints0/32/128/512. '
                         'No tuning from confirmation; all checkpoints reported.',
                predeclared_fit_gate='At update512 each training teacher source top1 >= .95 and CE <= .2.',
                fit_gate=all(v['top1'] >= .95 and v['ce'] <= .2 for k, v in final['train'].items() if k != 'all'),
                transfer_gate=all(v['ce'] < results[0]['confirm'][k]['ce']
                                  and v['top1'] > results[0]['confirm'][k]['top1']
                                  for k, v in final['confirm'].items()),
                results=results, live_updates=0, new_teacher_calls=0,
                limits='Confirmation was held out only from local updates; all data may have been '
                       'used previously by live training. Correlated replay, no win-rate test. '
                       'An unchanged value head still gets changed shared features; no promise '
                       'of unchanged value predictions or retained population strength.')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(run(args.directory), indent=2) + '\n')
