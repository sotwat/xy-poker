"""Compare fixed policies on identical seat-swapped deals at the pair level."""
import argparse
import json
import math
from pathlib import Path

import numpy as np


def compare(before, after):
    for result in (before, after):
        if not result['complete'] or result['pairs'] != 50 or result['games'] != 100:
            raise ValueError('Requires complete 50-pair results')
    for key in ('seed', 'simulations', 'rules_sha256', 'opponent', 'planned_pairs'):
        if before[key] != after[key]:
            raise ValueError('Comparison settings differ: ' + key)
    rows = []
    for pair_index, (old_pair, new_pair) in enumerate(zip(before['matches'], after['matches'])):
        if len(old_pair) != 2 or len(new_pair) != 2:
            raise ValueError('Missing seat-swapped game')
        utilities, scores = [], []
        for swap, old, new in zip((False, True), old_pair, new_pair):
            for match in (old, new):
                if (match['seed'] != before['seed'] + pair_index or match['swap'] != swap
                        or match['model_seat'] != 0):
                    raise ValueError('Seed, swap or learner seat mismatch')
            utilities.append(new['returns'][0] - old['returns'][0])
            scores.append((new['scores'][0] - new['scores'][1])
                          - (old['scores'][0] - old['scores'][1]))
        rows.append(dict(seed=before['seed'] + pair_index,
                         utility_delta=float(np.mean(utilities)), score_margin_delta=float(np.mean(scores))))
    delta = float(np.mean([row['utility_delta'] for row in rows]))
    radius = 4 * math.sqrt(math.log(40) / (2 * len(rows)))
    return dict(before={k: before[k] for k in ('model_sha256', 'training_games', 'wins', 'draws', 'losses')},
                after={k: after[k] for k in ('model_sha256', 'training_games', 'wins', 'draws', 'losses')},
                seed=before['seed'], pairs=50, games_per_model=100, simulations=before['simulations'],
                world_samples=8, opponent_settings='A9 default: 1000ms cap / 64 MC samples',
                mean_utility_delta=delta, paired_hoeffding95=[max(-2, delta - radius), min(2, delta + radius)],
                mean_score_margin_delta=float(np.mean([row['score_margin_delta'] for row in rows])),
                pair_records=rows, production_changed=False,
                scope='Pair means; observed equality is not proof of equal population strength. Score is secondary.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before', type=Path, required=True)
    parser.add_argument('--after', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(compare(json.loads(args.before.read_text()),
                                              json.loads(args.after.read_text())), indent=2))
