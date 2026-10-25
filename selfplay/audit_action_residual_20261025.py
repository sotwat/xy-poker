"""Frozen-base action-dependent residual: local teacher transfer, not strength."""
import collections
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from audit_teacher_fit_20261025 import measure
from audit_teacher_path_20261025 import decoded_mask
from train import PolicyValue, load_checkpoint, fingerprint


def features(x, actions):
    board = x[:1620].reshape(30, 54).argmax(1)
    hidden = x[1620:1650]
    rows = []
    for a in actions.tolist():
        f = torch.zeros(72)
        if a >= 520:
            rows.append(f)
            continue
        card, col, hide = a // 10, (a % 10) // 2, a % 2
        rank, suit = card % 13 + 2, card // 13
        f[rank - 2] = 1
        f[13], f[14 + col], f[19] = hide, 1, rank / 14
        for j, position in enumerate([r * 5 + col for r in range(3)] +
                                      [15 + r * 5 + col for r in range(3)]):
            code = int(board[position])
            offset = 20 + j * 7
            f[offset], f[offset + 1] = code == 0, code == 1
            if code >= 2:
                other = code - 2
                other_rank = other % 13 + 2
                f[offset + 2:offset + 6] = torch.tensor([
                    other_rank / 14, other_rank == rank, other // 13 == suit,
                    abs(other_rank - rank) / 12])
            f[offset + 6] = hidden[position]
        f[62:71] = x[1707:1716]
        f[71] = x[1702 + col]
        rows.append(f)
    return torch.stack(rows)


def permute_suits(x, actions):
    y = x.clone()
    permutation = [2, 0, 3, 1]
    for p in range(30):
        y[p * 54:(p + 1) * 54] = 0
        old = int(x[p * 54:(p + 1) * 54].argmax())
        new = old if old < 2 else 2 + permutation[(old - 2) // 13] * 13 + (old - 2) % 13
        y[p * 54 + new] = 1
    for card in range(52):
        y[1650 + permutation[card // 13] * 13 + card % 13] = x[1650 + card]
    aa = torch.tensor([a if a >= 520 else
                       (permutation[(a // 10) // 13] * 13 + (a // 10) % 13) * 10 + a % 10
                       for a in actions.tolist()])
    return y, aa


def test_features():
    x = torch.zeros(1716)
    x[:1620].reshape(30, 54)[:, 0] = 1
    board = x[:1620].reshape(30, 54)
    board[1] = 0
    board[1, 2 + 3] = 1  # Own hearts5 in column1.
    board[16] = 0
    board[16, 1] = 1  # Unknown opponent card, no rank/suit.
    x[1621], x[1703], x[1707] = 1, .5, .4
    actions = torch.tensor([29 * 10 + 1 * 2 + 1, 520, 521])  # Clubs5, col1, hidden.
    f = features(x, actions)
    assert f.shape == (3, 72)
    assert f[0, 3] == f[0, 13] == f[0, 15] == 1
    assert f[0, 19] == 5 / 14
    assert torch.equal(f[0, 20:27], torch.tensor([0., 0., 5/14, 1., 0., 0., 1.]))
    assert torch.equal(f[0, 41:48], torch.tensor([0., 1., 0., 0., 0., 0., 0.]))
    assert f[0, 62] == .4 and f[0, 71] == .5
    assert not f[1:].any()
    y, aa = permute_suits(x, actions)
    assert torch.equal(features(y, aa), f)


class Residual(nn.Module):
    def __init__(self, base, mode):
        super().__init__()
        self.base, self.mode = base, mode
        for p in base.parameters():
            p.requires_grad_(False)
        if mode == 'shared':
            self.head = nn.Sequential(nn.Linear(72, 32), nn.ReLU(), nn.Linear(32, 1))
            nn.init.zeros_(self.head[-1].weight)
            nn.init.zeros_(self.head[-1].bias)
        else:
            self.head = nn.Linear(128, 522)
            nn.init.zeros_(self.head.weight)
            nn.init.zeros_(self.head.bias)

    def forward(self, x):
        with torch.no_grad():
            logits, values = self.base(x)
            h = self.base.body(x)
        if self.mode == 'flat':
            return logits + self.head(h), values
        addition = torch.zeros_like(logits)
        for i, xx in enumerate(x):
            actions = torch.where(decoded_mask(xx))[0]
            placement = actions[actions < 520]
            if len(placement):
                addition[i, placement] = self.head(features(xx, placement)).squeeze(1)
        return logits + addition, values


def run(directory):
    test_features()
    torch.set_num_threads(1)
    started = time.monotonic()
    path = directory / 'latest.pt'
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    saved = load_checkpoint(path)
    snapshot = directory.parent / 'diagnostic-action-residual-20261025' / 'checkpoint.pt'
    snapshot.parent.mkdir(exist_ok=True)
    if not snapshot.exists():
        snapshot.write_bytes(path.read_bytes())
    assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == digest
    excluded = {g['seed'] for g in json.loads(Path('gto_teacher_fit_20261025.json').read_text())['manifest']}
    events = [json.loads(l) for l in (directory / 'events.jsonl').read_text().splitlines()]
    events = [e for e in events if e.get('event') == 'selfplay' and e['total_games'] <= saved['total_games']]
    cursor, games, quotas = len(saved['replay']), [], collections.Counter()
    for e in reversed(events):
        start = cursor - e['samples']
        if start < 0:
            break
        rows, cursor = saved['replay'][start:cursor], start
        if e['opponent'] not in ('baseline', 'teacher-selfplay') or e['match']['seed'] in excluded:
            continue
        key = (e['opponent'], e['match']['model_seat'])
        limit = 16 if key[0] == 'teacher-selfplay' else 8
        if quotas[key] < limit:
            games.append((e, rows)); quotas[key] += 1
        if len(games) == 32:
            break
    assert len(games) == 32 and sorted(quotas.values()) == [8, 8, 16]
    splits = {k: [] for k in ('train', 'selection', 'confirm')}
    ordinal, manifest = collections.Counter(), []
    for e, rows in sorted(games, key=lambda g: g[0]['total_games']):
        key = (e['opponent'], e['match']['model_seat'])
        split = ('train', 'train', 'selection', 'confirm')[ordinal[key] % 4]
        ordinal[key] += 1
        splits[split].extend(rows)
        manifest.append(dict(seed=e['match']['seed'], total_games=e['total_games'],
                             kind=key[0], model_seat=key[1], split=split, rows=len(rows)))
    assert len({g['seed'] for g in manifest}) == 32
    checks = 0
    for rows in splits.values():
        for row in rows:
            assert row['source'].startswith('teacher-a9') and row['pi'].max() == row['pi'].sum() == 1
            assert torch.equal(decoded_mask(row['x']), row['mask'])
            actions = torch.where(row['mask'])[0]
            y, aa = permute_suits(row['x'], actions)
            assert torch.equal(features(y, aa), features(row['x'], actions))
            checks += 1
    base = PolicyValue(saved['config']['width']).eval()
    base.load_state_dict(saved['model'])
    original = fingerprint(base)
    assert saved['config']['width'] == 128
    initial = {k: measure(base, v) for k, v in splits.items()}
    rng = np.random.RandomState(100525079)
    batches = [rng.randint(len(splits['train']), size=64).tolist() for _ in range(256)]
    outcomes = {}
    for mode in ('flat', 'shared'):
        torch.manual_seed(100525079)
        model = Residual(base, mode).eval()
        optimizer = torch.optim.AdamW(model.head.parameters(), lr=.001, weight_decay=1e-4)
        test = torch.stack([r['x'] for r in splits['confirm']])
        with torch.no_grad():
            old = base(test); new = model(test)
            assert all(torch.equal(a, b) for a, b in zip(old, new))
        # Cache frozen predictions and action features; no base or value updates.
        cache = []
        for row in splits['train']:
            xx = row['x']
            with torch.no_grad():
                logits, _ = base(xx[None]); h = base.body(xx[None])[0]
            actions = torch.where(row['mask'])[0]
            cache.append((logits[0, actions], h, actions, features(xx, actions),
                          int(torch.where(actions == int(row['pi'].argmax()))[0])))
        trace = []
        for step, ids in enumerate(batches, 1):
            assert time.monotonic() - started < 1200
            losses = []
            for idx in ids:
                logits, h, actions, fs, target = cache[idx]
                addition = model.head(h)[actions] if mode == 'flat' else model.head(fs).squeeze(1) * (actions < 520)
                losses.append(-(logits + addition).log_softmax(0)[target])
            loss = torch.stack(losses).mean()
            optimizer.zero_grad(); loss.backward()
            assert all(p.grad is None for p in base.parameters())
            nn.utils.clip_grad_norm_(model.head.parameters(), 5)
            optimizer.step()
            if step in (32, 128, 256):
                trace.append(dict(updates=step, train=measure(model, splits['train'])))
        metrics = {k: measure(model, rows) for k, rows in splits.items()}
        with torch.no_grad():
            assert torch.equal(model(test)[1], old[1])
        assert fingerprint(base) == original
        torch.save(model.head.state_dict(), snapshot.parent / f'{mode}-head.pt')
        outcomes[mode] = dict(parameters=sum(p.numel() for p in model.head.parameters()), trace=trace, metrics=metrics)
    def gate(split):
        return all(outcomes['shared']['metrics'][split][k]['ce'] < initial[split][k]['ce']
                   and outcomes['shared']['metrics'][split][k]['ce'] < outcomes['flat']['metrics'][split][k]['ce']
                   and outcomes['shared']['metrics'][split][k]['top1'] >= initial[split][k]['top1']
                   and outcomes['shared']['metrics'][split][k]['top1'] >= outcomes['flat']['metrics'][split][k]['top1']
                   for k in initial[split])
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
    return dict(total_games=saved['total_games'], checkpoint_sha256=digest, model_sha256=original,
                protocol='Exclude all78 games; latest32 teacher games stratified16/8/8. Per stratum '
                         '2train/1selection/1confirmation, fixed256 batch64 seed100525079. Frozen base; '
                         'zero residual; fresh head-only AdamW lr.001 wd1e-4 clip5 for both arms. '
                         'No checkpoint/hyperparameter selection. Selection and confirmation gates '
                         'require shared CE below flat and base, top1 >= both, all+eachteacher group.',
                feature_dimension=72, feature_suit_permutation_checks=checks, manifest=manifest,
                initial=initial, outcomes=outcomes, selection_gate=gate('selection'),
                confirm_gate=gate('confirm'), elapsed_seconds=time.monotonic()-started,
                base_preserved=True, live_updates=0, new_games=0, new_a9_calls=0,
                limits='Previously trained correlated replay; local transfer only. Unequal head capacity; '
                       'fresh head optimizers differ from original AdamW. No A9 matches/search/reducer '
                       'strength test; exact old outputs only at initialization, values remain fixed.')


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    args.output.write_text(json.dumps(run(args.directory), indent=2)+'\n')
