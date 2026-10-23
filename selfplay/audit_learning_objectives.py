"""Frozen temporal replay diagnostic; never updates the live checkpoint."""
import argparse
import copy
import json
from pathlib import Path

import numpy as np
import torch

from train import PolicyValue, load_checkpoint


def metrics(model, held):
    result = {}
    with torch.no_grad():
        for source in ('teacher-a9', 'teacher-a9-advice', 'search'):
            rows = [r for r in held if r.get('source') == source]
            sums = np.zeros(3)
            for start in range(0, len(rows), 128):
                batch = rows[start:start + 128]
                logits, value = model(torch.stack([r['x'] for r in batch]))
                pi = torch.stack([r['pi'] for r in batch])
                mask = torch.stack([r['mask'] for r in batch])
                logp = torch.log_softmax(logits.masked_fill(~mask, -1e9), dim=1)
                z = torch.tensor([r['z'] for r in batch])
                sums += [float(-(pi * logp).sum()),
                         float((logp.argmax(1) == pi.argmax(1)).sum()),
                         float(((value - z) ** 2).sum())]
            result[source] = dict(n=len(rows), ce=sums[0] / len(rows),
                                  accuracy=sums[1] / len(rows), mse=sums[2] / len(rows))
    return result


def suit_sample(row, rng):
    perm = rng.permutation(4)
    inverse = np.argsort([perm[i // 13] * 13 + i % 13 for i in range(52)])
    codes = torch.tensor(np.r_[0, 1, inverse + 2])
    actions = torch.tensor(np.r_[np.concatenate([np.arange(i * 10, (i + 1) * 10)
                                                for i in inverse]), 520, 521])
    x = row['x'].clone()
    x[:1620] = x[:1620].reshape(30, 54)[:, codes].reshape(-1)
    x[1650:1702] = x[1650:1702][torch.tensor(inverse)]
    return dict(x=x, pi=row['pi'][actions], mask=row['mask'][actions], z=row['z'])


def run(checkpoint):
    saved = load_checkpoint(checkpoint)
    torch.set_num_threads(1)
    fit, held = saved['replay'][:15000], saved['replay'][15000:]
    result = dict(model_sha256=saved['model_sha256'], total_games=saved['total_games'],
                  scope='post-hoc temporal replay split; correlated states, not independent deals',
                  fit=len(fit), held=len(held), steps=32, batch_size=64, seed=100524101,
                  augmentation_seed=100524201, modes={})
    for mode in ('before', 'uniform', 'teacher_policy', 'suit_augmentation'):
        model = PolicyValue(saved['config']['width']).eval()
        model.load_state_dict(saved['model'])
        optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=1e-4)
        optimizer.load_state_dict(copy.deepcopy(saved['optimizer']))
        rng, arng = np.random.RandomState(100524101), np.random.RandomState(100524201)
        pools = [[r for r in fit if r.get('source') == source]
                 for source in ('teacher-a9', 'teacher-a9-advice')]
        for _ in range(0 if mode == 'before' else 32):
            batch = [fit[int(i)] for i in rng.randint(len(fit), size=64)]
            if mode == 'suit_augmentation':
                batch = [suit_sample(r, arng) for r in batch]
            policy_batch = batch
            if mode == 'teacher_policy':
                policy_batch = [pool[int(i)] for pool in pools
                                for i in rng.randint(len(pool), size=32)]
            logits, _ = model(torch.stack([r['x'] for r in policy_batch]))
            _, value = model(torch.stack([r['x'] for r in batch]))
            mask = torch.stack([r['mask'] for r in policy_batch])
            pi = torch.stack([r['pi'] for r in policy_batch])
            z = torch.tensor([r['z'] for r in batch])
            loss = -(pi * torch.log_softmax(logits.masked_fill(~mask, -1e9), dim=1)).sum(1).mean()
            loss += ((value - z) ** 2).mean()
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5)
            optimizer.step()
        result['modes'][mode] = metrics(model, held)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(run(args.checkpoint), indent=2))
