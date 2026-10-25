"""Separate observed Y-column count and award-size deficits without inference."""
import argparse
import hashlib
import json
from fractions import Fraction
from pathlib import Path


def summarize(rows):
    wins = [sum(r['yWins'][i] for r in rows) for i in (0, 1)]
    points = [sum(r['y'][i] for r in rows) for i in (0, 1)]
    assert all(0 <= sum(r['yWins']) <= 5 for r in rows)
    assert all(w <= p <= 6 * w for r in rows
               for w, p in zip(r['yWins'], r['y']))
    mean_award = Fraction(sum(points), sum(wins))
    deficit = points[1] - points[0]
    count_term = mean_award * (wins[1] - wins[0])
    residual = deficit - count_term
    # Algebraic decomposition, not an intervention on legal play.
    assert residual == 2 * Fraction(points[1] * wins[0] - points[0] * wins[1], sum(wins))
    return dict(games=len(rows), columns_won=wins, points=points,
                tied_columns=5 * len(rows) - sum(wins),
                mean_points_per_won_column=[float(Fraction(p, w)) if w else None
                                           for p, w in zip(points, wins)],
                y_deficit=deficit, count_term=float(count_term),
                award_size_residual=float(residual),
                count_fraction=float(count_term / deficit) if deficit else None,
                learner_zero_column_games=sum(r['yWins'][0] == 0 for r in rows),
                learner_three_plus_columns_games=sum(r['yWins'][0] >= 3 for r in rows))


def audit(path):
    data = json.loads(path.read_text())
    rows = data['rows']
    assert len(rows) == 100 and len({r['pair'] for r in rows}) == 50
    assert all(sorted(r['swap'] for r in rows if r['pair'] == p) == [False, True]
               for p in range(50))
    return dict(input=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                model_sha256=data['model_sha256'], seed=data['seed'],
                groups={name: summarize(subset) for name, subset in [
                    ('all', rows), ('first25', [r for r in rows if r['pair'] < 25]),
                    ('last25', [r for r in rows if r['pair'] >= 25])]})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', nargs=2, type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    results = [audit(path) for path in args.inputs]
    assert results[0]['seed'] == results[1]['seed']
    args.output.write_text(json.dumps(dict(
        models=results, new_games=0, a9_control_games=0, training_changed=False,
        scope='Post-hoc accounting on reused evaluation deals; no causal or strength claim.'
    ), indent=2) + '\n')
