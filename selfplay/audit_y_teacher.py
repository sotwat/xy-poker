"""Frozen replay policy agreement on teacher choices completing Y columns."""
import argparse
import hashlib
import json
from pathlib import Path

import torch

from train import PolicyValue, load_checkpoint


def completion_columns(x):
    own = x[:15 * 54].reshape(3, 5, 54)
    assert torch.all(own.sum(-1) == 1)
    return (own[:, :, 0] == 0).sum(0) == 2


def evaluate(model, rows):
    sums = dict(n=0, exact=0, column=0, uniform_exact=0.0,
                teacher_probability=0.0, ce=0.0, value=0.0, target=0.0,
                mse=0.0, zero_value_mse=0.0)
    with torch.no_grad():
        for start in range(0, len(rows), 128):
            batch = rows[start:start + 128]
            x = torch.stack([r['x'] for r in batch])
            mask = torch.stack([r['mask'] for r in batch])
            targets = torch.stack([r['pi'] for r in batch]).argmax(1)
            logits, values = model(x)
            logp = logits.masked_fill(~mask, -1e9).log_softmax(1)
            predicted = logp.argmax(1)
            losses = -logp[torch.arange(len(batch)), targets]
            z = torch.tensor([r['z'] for r in batch])
            sums['n'] += len(batch)
            sums['exact'] += int((predicted == targets).sum())
            sums['column'] += int(((predicted % 10 // 2) == (targets % 10 // 2)).sum())
            sums['uniform_exact'] += float((1 / mask.sum(1)).sum())
            sums['teacher_probability'] += float((-losses).exp().sum())
            sums['ce'] += float(losses.sum())
            sums['value'] += float(values.sum())
            sums['target'] += float(z.sum())
            sums['mse'] += float(((values - z) ** 2).sum())
            sums['zero_value_mse'] += float((z ** 2).sum())
    return {k: (v if k in ('n', 'exact', 'column') else v / sums['n'] if sums['n'] else None)
            for k, v in sums.items()}


def run(replay_path, model_paths):
    torch.set_num_threads(1)
    saved = load_checkpoint(replay_path)
    groups = {}
    excluded = dict(search=0, turn_selection=0, no_mixed_completion_choice=0)
    for row in saved['replay']:
        if not row.get('source', '').startswith('teacher-a9'):
            excluded['search'] += 1
            continue
        target = int(row['pi'].argmax())
        assert float(row['pi'][target]) == 1 and bool(row['mask'][target])
        if target >= 520:
            excluded['turn_selection'] += 1
            continue
        completing = completion_columns(row['x'])
        legal_columns = sorted(set(int(a) % 10 // 2 for a in row['mask'].nonzero().flatten()
                                   if int(a) < 520))
        if not (any(completing[c] for c in legal_columns)
                and any(not completing[c] for c in legal_columns)):
            excluded['no_mixed_completion_choice'] += 1
            continue
        key = row['source'] + ('/complete' if completing[target % 10 // 2] else '/defer')
        groups.setdefault(key, []).append(row)
    results = []
    for path in model_paths:
        checkpoint = load_checkpoint(path)
        model = PolicyValue(checkpoint['config']['width']).eval()
        model.load_state_dict(checkpoint['model'])
        results.append(dict(model_sha256=checkpoint['model_sha256'],
                            groups={name: evaluate(model, rows) for name, rows in sorted(groups.items())}))
    assert sum(len(v) for v in groups.values()) + sum(excluded.values()) == len(saved['replay'])
    return dict(replay_sha256=hashlib.sha256(replay_path.read_bytes()).hexdigest(),
                replay_games=saved['total_games'], replay_samples=len(saved['replay']),
                excluded=excluded, models=results, training_updates=0, new_games=0,
                scope='Post-hoc correlated training replay; raw network agreement, not search or win strength.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replay', type=Path, required=True)
    parser.add_argument('--models', nargs=2, type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(run(args.replay, args.models), indent=2) + '\n')
