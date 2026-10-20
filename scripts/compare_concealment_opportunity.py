import hashlib
import json
from collections import Counter
from pathlib import Path

old_path = Path('gto_concealment_continuation_20261019.json')
new_path = Path('gto_concealment_opportunity_20261020.json')
old, new = (json.loads(p.read_text()) for p in [old_path, new_path])
for data in (old, new):
    for name, sha in data['sourceHashes'].items():
        assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == sha
results = []
for before, after in zip(old['groups'], new['groups']):
    assert before['seed'] == after['seed']
    assert before['excluded'] == after['excluded']
    assert len(before['cases']) == len(after['cases'])
    table = Counter()
    for a, b in zip(before['cases'], after['cases']):
        for key in ['rowIndex', 'worldIndex', 'root', 'profile', 'deal', 'swap', 'ply']:
            assert a[key] == b[key]
        for arm_a, arm_b in zip(a['arms'], b['arms']):
            assert arm_a['moves'][:2] == arm_b['moves'][:2]
        assert a['firstResponseChanged'] == b['firstResponseChanged']
        assert a['deltaWin'] == a['arms'][1]['win'] - a['arms'][0]['win']
        assert b['deltaWin'] == b['arms'][1]['win'] - b['arms'][0]['win']
        table[a['deltaWin'], b['deltaWin']] += 1
    results.append({
        'phase': before['phase'], 'seed': before['seed'], 'pairs': len(before['cases']),
        'sumOldDelta': sum(a['deltaWin'] for a in before['cases']),
        'sumNewDelta': sum(a['deltaWin'] for a in after['cases']),
        'changedDelta': sum(n for (a, b), n in table.items() if a != b),
        'oldWorseStillWorse': sum(n for (a, b), n in table.items() if a < 0 and b < 0),
        'oldWorseNowEqual': sum(n for (a, b), n in table.items() if a < 0 and b == 0),
        'oldWorseNowBetter': sum(n for (a, b), n in table.items() if a < 0 and b > 0),
        'oldNonworseNowWorse': sum(n for (a, b), n in table.items() if a >= 0 and b < 0),
        'table': [{'oldDelta': a, 'newDelta': b, 'pairs': n} for (a, b), n in sorted(table.items())],
    })
paths = [old_path, new_path, Path(__file__)]
with Path('gto_concealment_opportunity_comparison_20261020.json').open('x') as f:
    json.dump({'kind': 'restricted-policy-interaction-not-quota-price',
               'sourceHashes': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
               'groups': results}, f, indent=2)
print(json.dumps(results))
