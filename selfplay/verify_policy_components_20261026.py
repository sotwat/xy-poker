"""Independent arithmetic for the reducer's exported X/Y component rows."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT / 'gto_policy_continuation_20261026.json').read_bytes()
d = json.loads(raw)
c = json.loads((ROOT / 'gto_policy_components_20261026.json').read_text())
s = json.loads((ROOT / 'gto_policy_continuation_summary_20261026.json').read_text())
assert c['input_sha256'] == s['input_sha256'] == hashlib.sha256(raw).hexdigest()
summary = {}
for group in ('selection', 'confirmation'):
    subset = [r for r in c['rows'] if r['group'] == group]
    totals = {arm:dict(wins=0,draws=0,losses=0,x_margin=0,y_margin=0,score_margin=0) for arm in ('learner','teacher')}
    for row in subset:
        actor = row['actor']
        for arm, out in row['outcomes'].items():
            origin = next(r for r in d['rows'] if r['seed']==row['seed'] and r['mirror']==row['mirror'])['outcomes'][arm]
            y = [sum(col['points'] for col in out['columns'] if col['winner']==seat) for seat in (0,1)]
            assert y == out['y']
            scores = [out['x'][i]+y[i] for i in (0,1)]
            assert scores == [p['score'] for p in origin['final']['players']]
            margin = scores[actor]-scores[1-actor]
            utility = (margin>0)-(margin<0)
            assert utility == out['utility'] == origin['utility']
            assert margin == out['scoreMargin'] == origin['score_margin']
            t=totals[arm]
            t['wins' if utility>0 else 'losses' if utility<0 else 'draws']+=1
            t['x_margin']+=out['x'][actor]-out['x'][1-actor]
            t['y_margin']+=y[actor]-y[1-actor]
            t['score_margin']+=margin
    for t in totals.values():
        assert t['x_margin']+t['y_margin']==t['score_margin']
    pairs = s['groups'][group]['pairs']
    assert sum(p['score_difference'] for p in pairs)*2==totals['teacher']['score_margin']-totals['learner']['score_margin']
    summary[group]=totals
c['independent_arithmetic']=summary
(ROOT / 'gto_policy_components_20261026.json').write_text(json.dumps(c,indent=2)+'\n')
print(json.dumps(summary))
