"""Post-hoc value predictions of two frozen models on identical saved states."""
import argparse
import json
from pathlib import Path

import numpy as np
import torch

from environment import Bridge
from train import Evaluator, PolicyValue, load_checkpoint, paired_state


def run(result_path, before_path):
    result = json.loads(result_path.read_text())
    assert result['complete'] and result['games'] == 100
    models, hashes = [], []
    torch.set_num_threads(1)
    for path in (before_path, Path(result['checkpoint'])):
        saved = load_checkpoint(path)
        model = PolicyValue(saved['config']['width']).eval()
        model.load_state_dict(saved['model'])
        models.append(model)
        hashes.append(saved['model_sha256'])
    rows = []
    with Bridge() as bridge:
        for pair in result['matches'][:10]:
            for match in pair:
                state = paired_state(bridge, match['seed'], match['swap'])
                for ply, action in enumerate(match['actions']):
                    if ply >= 14 and state.current_player() == 0:
                        values = [Evaluator(model, lambda: None, np.random.RandomState(0)).infer(state)[2]
                                  for model in models]
                        rows.append(dict(seed=match['seed'], swap=match['swap'], ply=ply,
                                         values=values, outcome=match['returns'][0]))
                        break
                    state.apply_action(action)
    return dict(model_sha256=hashes, rows=rows,
                mean_values=np.mean([row['values'] for row in rows], axis=0).tolist(),
                mean_outcome=float(np.mean([row['outcome'] for row in rows])),
                scope='Post-hoc first 10 deals of 10000-game trajectories; identical inputs, not causal proof')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--before', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(run(args.result, args.before), indent=2))
