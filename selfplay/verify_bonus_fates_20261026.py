"""Independent saved-board and arithmetic checks of bonus fate accounting."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT/(sys.argv[1] if len(sys.argv)>1 else 'gto_bonus_choice_20261026.json')).read_bytes()
source = json.loads(raw)
d = json.loads((ROOT/(sys.argv[2] if len(sys.argv)>2 else 'gto_bonus_fates_20261026.json')).read_text())
assert d['input_sha256'] == hashlib.sha256(raw).hexdigest()
assert len(d['rows']) == len(source['rows']) == 8
for r, original in zip(d['rows'], source['rows']):
    assert (r['seed'],r['mirror'],r['actor']) == (original['seed'],original['mirror'],original['actor'])
    for arm in r['arms']:
        out = original['outcomes'][arm['mode']]
        assert [arm['x'][i]+arm['y'][i] for i in (0,1)] == [p['score'] for p in out['final']['players']]
        y = [sum(c['points'] for c in arm['columns'] if c['winner']==seat) for seat in (0,1)]
        assert y == arm['y']
        for draw in arm['bonusDraws']:
            board = out['final']['players'][draw['seat']]['board']
            hand = out['final']['players'][draw['seat']]['hand']
            used = any(c and c['id']==draw['card'] for row in board for c in row)
            assert used == (draw['playedAt'] is not None)
            assert used != any(c['id']==draw['card'] for c in hand)
        if arm['mode']=='bonus':
            root = next(x for x in arm['bonusDraws'] if x['move']==0)
            assert root['card']==original['root']['deck'][0]['id'] and root['seat']==r['actor']
            assert arm['targetColumnBonusOwner']==r['actor']
for group,g in d['groups'].items():
    subset=[r for r in d['rows'] if r['group']==group]
    assert g['rootBonusUsed']==sum(r['arms'][0]['rootBonusPlayedAt'] is not None for r in subset)
    for i in (0,1):
        assert g['targetColumnWins'][i]==sum(r['arms'][i]['targetColumnActorWins'] for r in subset)
        for comp in ('X','Y'):
            assert g['actor'+comp+'Margin'][i]==sum(r['arms'][i][comp.lower()][r['actor']]-r['arms'][i][comp.lower()][1-r['actor']] for r in subset)
    total_delta=(g['actorXMargin'][0]-g['actorXMargin'][1]+g['actorYMargin'][0]-g['actorYMargin'][1])
    outcomes=[r for r in source['rows'] if r['group']==group]
    assert total_delta==sum(r['outcomes']['bonus']['score_margin']-r['outcomes']['defer']['score_margin'] for r in outcomes)
print('16 board components, all bonus-card fates and group arithmetic agree')
