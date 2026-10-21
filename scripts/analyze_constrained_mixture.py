"""Exact restricted-game optimization; no production policy is changed."""
import datetime as dt
from fractions import Fraction as F
from itertools import combinations
import hashlib
import json
from pathlib import Path
import sys

limit = dt.datetime.fromisoformat(sys.argv[1].replace('Z', '+00:00'))
def check_time():
    assert dt.datetime.now(dt.timezone.utc) < limit, 'absolute deadline expired'
check_time()
started = dt.datetime.now(dt.timezone.utc).isoformat()

def linear_solve(a, b):
    n = len(b)
    a = [list(row)+[v] for row,v in zip(a,b)]
    for col in range(n):
        piv = next((r for r in range(col,n) if a[r][col]), None)
        if piv is None: return None
        a[col],a[piv] = a[piv],a[col]
        scale = a[col][col]
        a[col] = [v/scale for v in a[col]]
        for r in range(n):
            if r != col:
                scale = a[r][col]
                a[r] = [v-scale*w for v,w in zip(a[r],a[col])]
    return [r[-1] for r in a]

def solve(m, baseline):
    count = len(m)
    eq = [F(1)]*count+[F(0)]
    constraints = []
    for i in range(count):
        row=[F(0)]*(count+1); row[i]=F(-1)
        constraints.append((row,F(0)))
    for j in range(4):
        row=[-m[i][j] for i in range(count)]+[F(0)]
        constraints.append((row,-m[baseline][j]))
        constraints.append((row[:-1]+[F(1)],F(0)))
    best = None
    for active in combinations(range(len(constraints)),count):
        check_time()
        x=linear_solve([eq]+[constraints[i][0] for i in active],[F(1)]+[constraints[i][1] for i in active])
        if x is None or any(sum(a*b for a,b in zip(row,x))>rhs for row,rhs in constraints):continue
        key=(x[-1],x[baseline],tuple(x[:-1]))
        if best is None or key>best[0]:best=(key,x)
    assert best is not None
    w=best[1][:-1]
    pure=max(min(row) for row in m if all(v>=b for v,b in zip(row,m[baseline])))
    return w,best[1][-1],pure

w,value,pure=solve([[F(0)]*4,[F(1),F(-1,2),F(1),F(-1,2)],[F(-1,2),F(1),F(-1,2),F(1)]],0)
assert w==[0,F(1,2),F(1,2)] and value==F(1,4) and pure==0
assert solve([[F(0)]*4,[F(-1)]*4],0)==([F(1),F(0)],F(0),F(0))
input_path=Path('gto_constrained_mixture_worlds_20261021.json')
data=json.loads(input_path.read_text())
rows=[]
for g in data['groups']:
    for ri,r in enumerate(g['rows']):
        mats=[]
        for batch in r['batches']:
            mats.append([[F(sum(w['arms'][j][a]['win'] for w in batch['worlds']),16) for j in range(4)] for a in range(len(r['actions']))])
        weights,val,pure=solve(mats[0],r['baseline'])
        mixed=[sum(w*mats[1][i][j] for i,w in enumerate(weights)) for j in range(4)]
        delta=[v-mats[1][r['baseline']][j] for j,v in enumerate(mixed)]
        rows.append(dict(phase=g['phase'],row=ri,deal=r['deal'],swap=r['swap'],weights=list(map(str,weights)),fitValue=str(val),fitPureValue=str(pure),strictMixedGain=str(val-pure),heldoutMixed=list(map(str,mixed)),heldoutDelta=list(map(str,delta))))
summary=[]
for phase in ['selection','confirmation']:
    unique=[r for r in rows if r['phase']==phase and r['swap']==0]
    strict=[r for r in unique if F(r['strictMixedGain'])>0]
    summary.append(dict(phase=phase,deals=len(unique),strictMixedDeals=len(strict),heldoutNonworseStrictDeals=sum(all(F(v)>=0 for v in r['heldoutDelta']) for r in strict),supported=bool(strict) and all(F(v)>=0 for r in strict for v in r['heldoutDelta']) and any(F(v)>0 for r in strict for v in r['heldoutDelta'])))
paths=[str(input_path),'scripts/analyze_constrained_mixture.py']
out=dict(kind='finite-profile-baseline-constrained-mixture-not-strength',startedUtc=started,endedUtc=dt.datetime.now(dt.timezone.utc).isoformat(),sourceHashes={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths},rows=rows,summary=summary)
check_time()
with Path('gto_constrained_mixture_solution_20261021.json').open('x') as f:json.dump(out,f,indent=2)
print(json.dumps(summary))
