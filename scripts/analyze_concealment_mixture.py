import hashlib
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from fractions import Fraction as F
from pathlib import Path

start = datetime.now(timezone.utc)
deadline = datetime.fromisoformat(sys.argv[1].replace('Z', '+00:00'))
assert start < deadline, 'Absolute task deadline exceeded'

def solve(a, b):
    d = [y-x for x, y in zip(a, b)]
    choices = {F(0), F(1)}
    for i in range(len(a)):
        for j in range(i):
            if d[i] != d[j]:
                p = F(a[j]-a[i], d[i]-d[j])
                if 0 <= p <= 1:
                    choices.add(p)
    value = lambda p: min(x+p*y for x, y in zip(a, d))
    best = max(map(value, choices))
    p = min(p for p in choices if value(p) == best)
    pure = F(max(min(a), min(b)))
    return {'hideProbability': str(p), 'mixedValue': str(best), 'pureValue': str(pure), 'gain': str(best-pure)}

assert solve([1, -1], [-1, 1]) == {'hideProbability': '1/2', 'mixedValue': '0', 'pureValue': '-1', 'gain': '1'}
assert solve([0, 0], [0, 0])['hideProbability'] == '0'
assert solve([-1, 0], [1, 1])['hideProbability'] == '1'
paths = ['gto_concealment_continuation_20261019.json', 'gto_concealment_opportunity_20261020.json']
groups = []
for path in paths:
    data = json.loads(Path(path).read_text())
    for name, sha in data['sourceHashes'].items():
        assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == sha
    for g in data['groups']:
        by_world = defaultdict(list)
        for c in g['cases']:
            by_world[c['rowIndex'], c['worldIndex']].append(c)
        worlds = []
        for (row, wi), cases in sorted(by_world.items()):
            assert datetime.now(timezone.utc) < deadline
            cases.sort(key=lambda c: c['profile'])
            assert [c['profile'] for c in cases] == [0, 1, 2, 3]
            matrix = [[0 if c['arms'][arm]['winner'] == 'draw' else 1 if c['arms'][arm]['winner'] == 'p'+str(c['root']+1) else -1 for c in cases] for arm in [0, 1]]
            solution = solve(*matrix)
            assert F(solution['gain']) >= 0
            worlds.append({'rowIndex': row, 'worldIndex': wi, 'deal': cases[0]['deal'], 'swap': cases[0]['swap'], 'ply': cases[0]['ply'], 'matrix': matrix, **solution})
        groups.append({'source': path, 'phase': g['phase'], 'seed': g['seed'], 'worlds': worlds,
                       'summary': {'worlds': len(worlds), 'strictGains': sum(F(w['gain']) > 0 for w in worlds),
                                   'sumGain': str(sum((F(w['gain']) for w in worlds), F(0))),
                                   'maxGain': str(max(F(w['gain']) for w in worlds))}})
paths.append(str(Path(__file__)))
with Path('gto_concealment_mixture_20261021.json').open('x') as f:
    json.dump({'kind': 'world-conditioned-two-action-restricted-game-not-gto', 'startedUtc': start.isoformat(), 'endedUtc': datetime.now(timezone.utc).isoformat(),
               'absoluteDeadlineUtc': deadline.isoformat(), 'sourceHashes': {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}, 'groups': groups}, f, indent=2)
print(json.dumps([{k: g[k] for k in ['source', 'phase', 'summary']} for g in groups]))
