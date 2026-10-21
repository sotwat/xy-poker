"""Independent exact-arithmetic check of the fixed-policy held-out estimates."""
import json
from fractions import Fraction as F
from pathlib import Path

x = json.loads(Path('gto_infoset_concealment_20261021.json').read_text())

def near(actual, exact):
    assert abs(actual-float(exact)) < 1e-12, (actual, exact)

def solution(m):
    a, b = m
    d = [y-z for y, z in zip(b, a)]
    points = {F(0), F(1)}
    for i in range(4):
        for j in range(i):
            if d[i] != d[j]:
                p = (a[j]-a[i])/(d[i]-d[j])
                if 0 <= p <= 1:
                    points.add(p)
    value = lambda p: min(v+p*slope for v, slope in zip(a, d))
    best = max(map(value, points))
    p = min(p for p in points if value(p) == best)
    pure = int(min(b) > min(a))
    return p, best, pure, min(m[pure])

summary = []
for g in x['groups']:
    rows = []
    for r in g['rows']:
        mats = []
        for batch in r['batches']:
            m = [[F(sum(0 if w['arms'][j][a]['winner']=='draw' else 1 if w['arms'][j][a]['winner']==f"p{r['root']+1}" else -1 for w in batch['worlds']),16) for j in range(4)] for a in range(2)]
            for actual, exact in zip(batch['matrix'], m):
                for av, ev in zip(actual, exact): near(av, ev)
            mats.append(m)
        p, val, purep, pureval = solution(mats[0])
        for k,v in zip(['p','value','pureP','pureValue'],[p,val,purep,pureval]): near(r['fit'][k],v)
        mixed = [(1-p)*a+p*b for a,b in zip(*mats[1])]
        pure = mats[1][purep]
        diffs = [a-b for a,b in zip(mixed,pure)]
        for k, arr in [('mixed',mixed),('pure',pure),('profileDelta',diffs)]:
            for av,ev in zip(r['heldout'][k],arr): near(av,ev)
        delta = min(mixed)-min(pure)
        near(r['heldout']['minDelta'],delta)
        if r['swap']==0:
            rows.append(dict(deal=r['deal'],p=str(p),strictFitGain=str(val-pureval),heldoutMinDelta=str(delta),heldoutAnyProfileHarm=any(v<0 for v in diffs)))
        else:
            counterpart = next(v for v in g['rows'] if v['deal']==r['deal'] and v['swap']==0)
            assert counterpart['fit']==r['fit'] and counterpart['heldout']==r['heldout']
    summary.append(dict(phase=g['phase'],independentDeals=4,rows=rows))
print(json.dumps(dict(verified=True,summary=summary),ensure_ascii=False))
