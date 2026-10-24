"""Independently verify saved milestone component accounting (no inference)."""
import json
import sys
from collections import defaultdict
from pathlib import Path

d = json.loads(Path(sys.argv[1]).read_text())
rows = d['rows']
assert len(rows) == d['games'] == 100
pairs = defaultdict(list)
for row in rows:
    pairs[row['pair']].append(row)
    assert row['seed'] == d['seed'] + row['pair']
    assert [a + b for a, b in zip(row['x'], row['y'])] == row['scores']
assert set(pairs) == set(range(50))
assert all(sorted(r['swap'] for r in pair) == [False, True] for pair in pairs.values())
for name, predicate in [('first25deals', lambda r: r['pair'] < 25),
                        ('last25deals', lambda r: r['pair'] >= 25)]:
    subset = [r for r in rows if predicate(r)]
    expected = {'games': len(subset),
                'xPointSum': [sum(r['x'][i] for r in subset) for i in range(2)],
                'yPointSum': [sum(r['y'][i] for r in subset) for i in range(2)],
                'xWins': sum(r['x'][0] > r['x'][1] for r in subset),
                'yWins': sum(r['y'][0] > r['y'][1] for r in subset),
                'bonuses': [sum(r[key] for r in subset)
                            for key in ['modelBonuses', 'opponentBonuses']]}
    assert expected == d['groups'][name]
result = json.loads(Path(sys.argv[2]).read_text())
assert result['model_sha256'] == d['model_sha256'] and result['seed'] == d['seed']
assert sum(r['scores'][0] > r['scores'][1] for r in rows) == result['wins']
assert sum(r['scores'][0] == r['scores'][1] for r in rows) == result['draws']
assert sum(r['scores'][0] < r['scores'][1] for r in rows) == result['losses']
assert d['newGames'] == 0 and d['productionChanged'] is False
print('Verified 50 paired deals, 100 score decompositions and both aggregates.')
