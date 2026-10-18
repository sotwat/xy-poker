"""Partition saved opponent response differences without replaying games."""
import hashlib
import itertools
import json
from pathlib import Path


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def category(a, b):
    placement = (a['cardId'], a['colIndex']) != (b['cardId'], b['colIndex'])
    hidden = a['isHidden'] != b['isHidden']
    return ('both' if hidden else 'placement_only') if placement else ('hidden_only' if hidden else 'same')


def aggregate(worlds):
    pairs = []
    for a, b in itertools.combinations(range(4), 2):
        counts = dict.fromkeys(['same', 'placement_only', 'hidden_only', 'both'], 0)
        examples = []
        for index, world in enumerate(worlds):
            kind = category(world['moves'][a], world['moves'][b])
            counts[kind] += 1
            if kind == 'hidden_only':
                examples.append(index)
        assert sum(counts.values()) == len(worlds)
        if b < 3:
            assert counts['hidden_only'] == 0
        pairs.append({'a': a, 'b': b, **counts, 'hiddenOnlyWorldIndices': examples})
    return {'worlds': len(worlds), 'pairs': pairs}


if __name__ == '__main__':
    base = {'cardId': 'clubs-2', 'colIndex': 0, 'isHidden': False}
    assert category(base, base) == 'same'
    assert category(base, {**base, 'isHidden': True}) == 'hidden_only'
    assert category(base, {**base, 'colIndex': 1}) == 'placement_only'
    assert category(base, {**base, 'cardId': 'clubs-3', 'isHidden': True}) == 'both'
    source = 'gto_profile_stages_20261018.json'
    data = json.loads(Path(source).read_text())
    for path, expected in data['sourceHashes'].items():
        assert digest(path) == expected, path
    groups = []
    for group in data['groups']:
        rows = group['rows']
        assert len(rows) == 24
        assert {(r['deal'], r['swap'], r['ply']) for r in rows} == set(itertools.product(range(4), range(2), [6, 14, 22]))
        assert all(len(r['worlds']) == 4 for r in rows)
        worlds = [w for r in rows for w in r['worlds']]
        assert all(len(w['moves']) == 4 for w in worlds)
        groups.append({'phase': group['phase'], 'seed': group['seed'], **aggregate(worlds),
                       'stages': [{'ply': ply, **aggregate([w for r in rows if r['ply'] == ply for w in r['worlds']])}
                                  for ply in [6, 14, 22]]})
    result = {'kind': 'posthoc-placement-concealment-partition-not-strength',
              'source': source, 'sourceSha256': digest(source), 'scriptSha256': digest(__file__),
              'profiles': ['A7', 'A6', 'A4', 'A3'], 'newGames': 0, 'newTerminalScores': 0, 'groups': groups}
    with Path('gto_profile_concealment_20261019.json').open('x') as f:
        json.dump(result, f, indent=2)
        f.write('\n')
    print(json.dumps([{k: v for k, v in group.items() if k != 'stages'} for group in groups]))
