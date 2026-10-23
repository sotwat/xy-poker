"""Post-hoc teacher coverage on saved held-out learner trajectories; no updates."""
import argparse
import json
from pathlib import Path

import numpy as np
import torch

from environment import Bridge
from train import Evaluator, PolicyValue, load_checkpoint, paired_state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    saved = json.loads(args.result.read_text())
    assert saved['complete'] and saved['games'] == 100 and saved['pairs'] == 50
    checkpoint = load_checkpoint(Path(saved['checkpoint']))
    assert checkpoint['model_sha256'] == saved['model_sha256']
    torch.set_num_threads(2)
    model = PolicyValue(checkpoint['config']['width']).eval()
    model.load_state_dict(checkpoint['model'])
    rows = []
    with Bridge() as bridge:
        for pair in saved['matches'][:10]:
            for match in pair:
                state = paired_state(bridge, match['seed'], match['swap'])
                for ply, action in enumerate(match['actions']):
                    if ply >= 14 and state.current_player() == match['model_seat']:
                        evaluator = Evaluator(model, lambda: None, np.random.RandomState(100523201))
                        legal, probabilities, value = evaluator.infer(state)
                        teacher = bridge.call('baseline', state=state.data, baseline='a9',
                                              seed=100523201 + len(rows))
                        assert teacher in legal
                        rows.append(dict(seed=match['seed'], swap=match['swap'], ply=ply,
                                         teacher=teacher, played=action,
                                         policy_best=legal[int(np.argmax(probabilities))],
                                         teacher_probability=float(probabilities[legal.index(teacher)]),
                                         value=value, outcome=match['returns'][match['model_seat']]))
                        break
                    state.apply_action(action)
    result = dict(model_sha256=saved['model_sha256'], records=rows,
                  scope='post-hoc first 10 evaluation pairs, one midgame learner state per seat',
                  training_updates=0, teacher_seed=100523201,
                  agreement=sum(r['teacher'] == r['policy_best'] for r in rows),
                  search_agreement=sum(r['teacher'] == r['played'] for r in rows),
                  mean_value=float(np.mean([r['value'] for r in rows])),
                  mean_teacher_probability=float(np.mean([r['teacher_probability'] for r in rows])))
    args.output.write_text(json.dumps(result, indent=2))
    print({k: v for k, v in result.items() if k != 'records'})


if __name__ == '__main__':
    main()
