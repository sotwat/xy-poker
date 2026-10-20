import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

start = datetime.now(timezone.utc)
deadline = datetime.fromisoformat(sys.argv[1].replace('Z', '+00:00'))
assert start < deadline, 'Absolute task deadline exceeded; no analysis started'

def classify(values):
    low, high = min(values), max(values)
    if low == high == 0:
        return 'equal'
    if low >= 0:
        return 'hideNonworse'
    if high <= 0:
        return 'publicNonworse'
    return 'conflict'

assert classify([0, 0, 0, 0]) == 'equal'
assert classify([0, 1, 2, 0]) == 'hideNonworse'
assert classify([-1, 0, -2, 0]) == 'publicNonworse'
assert classify([-1, 1, 0, 0]) == 'conflict'
paths = ['gto_concealment_continuation_20261019.json', 'gto_concealment_opportunity_20261020.json']
result = []
for path in paths:
    data = json.loads(Path(path).read_text())
    for name, sha in data['sourceHashes'].items():
        assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == sha
    for group in data['groups']:
        buckets = defaultdict(list)
        for case in group['cases']:
            buckets[case['rowIndex'], case['worldIndex']].append(case)
        worlds = []
        for (row, world), cases in sorted(buckets.items()):
            assert datetime.now(timezone.utc) < deadline
            cases.sort(key=lambda c: c['profile'])
            assert [c['profile'] for c in cases] == [0, 1, 2, 3]
            for c in cases:
                for k in ['deal', 'swap', 'ply', 'root']:
                    assert c[k] == cases[0][k]
                assert [a['moves'][0] for a in c['arms']] == [a['moves'][0] for a in cases[0]['arms']]
            deltas = []
            for c in cases:
                values = [0 if a['winner'] == 'draw' else 1 if a['winner'] == 'p' + str(c['root'] + 1) else -1 for a in c['arms']]
                assert values == [a['win'] for a in c['arms']]
                deltas.append(values[1] - values[0])
                assert deltas[-1] == c['deltaWin']
            worlds.append({'rowIndex': row, 'worldIndex': world, 'deal': cases[0]['deal'], 'swap': cases[0]['swap'], 'ply': cases[0]['ply'],
                           'deltas': deltas, 'classification': classify(deltas),
                           'positiveMeanWithLoss': sum(deltas) > 0 and min(deltas) < 0})
        counts = Counter(w['classification'] for w in worlds)
        result.append({'source': path, 'phase': group['phase'], 'seed': group['seed'], 'worlds': worlds,
                       'summary': {'worlds': len(worlds), 'classes': {k: counts[k] for k in ['equal', 'hideNonworse', 'publicNonworse', 'conflict']},
                                   'positiveMeanWithLoss': sum(w['positiveMeanWithLoss'] for w in worlds)}})
source_paths = paths + [str(Path(__file__))]
with Path('gto_concealment_profile_safety_20261020.json').open('x') as f:
    json.dump({'kind': 'finite-profile-concealment-comparison-not-safety-proof', 'startedUtc': start.isoformat(),
               'endedUtc': datetime.now(timezone.utc).isoformat(), 'absoluteDeadlineUtc': deadline.isoformat(),
               'sourceHashes': {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in source_paths}, 'groups': result}, f, indent=2)
print(json.dumps([{k: g[k] for k in ['source', 'phase', 'seed', 'summary']} for g in result]))
