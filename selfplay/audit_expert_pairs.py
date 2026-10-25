"""One new seat-swapped A9 self-play deal; data-path check, not strength evidence."""
import argparse
import json
from pathlib import Path

import numpy as np
import torch

from environment import Bridge
from train import PolicyValue, load_checkpoint, play


def run(checkpoint):
    saved = load_checkpoint(checkpoint)
    torch.set_num_threads(2)
    model = PolicyValue(saved['config']['width']).eval()
    model.load_state_dict(saved['model'])
    records, values, targets = [], [], []
    with Bridge() as bridge:
        for swap in (False, True):
            samples, match = play(bridge, model, 100524301, 128,
                                  opponent='teacher-selfplay', training=True, swap=swap)
            with torch.no_grad():
                _, predictions = model(torch.stack([r['x'] for r in samples]))
            assert len(samples) == len(match['actions']) == 31
            assert all(r['source'] == 'teacher-a9-selfplay' for r in samples)
            assert all(r['mask'][int(r['pi'].argmax())] for r in samples)
            values.extend(predictions.tolist())
            targets.extend(r['z'] for r in samples)
            records.append(match)
    return dict(seed=100524301, pairs=1, games=2, samples=len(values),
                predicted_mean=float(np.mean(values)), target_mean=float(np.mean(targets)),
                positive=sum(z == 1 for z in targets), negative=sum(z == -1 for z in targets),
                draws=sum(z == 0 for z in targets), model_sha256=saved['model_sha256'],
                matches=records, training_updates=0, live_replay_changed=False,
                scope='A9-default versus A9-default data-path diagnostic on one fresh deal, not adoption evidence')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(run(args.checkpoint), indent=2))
