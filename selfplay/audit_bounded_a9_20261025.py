"""Integration regression for diagnostic proof caps; no strength games."""
import json,time
from pathlib import Path
from diagnostic_probe import DiagnosticProbe
from environment import Bridge,XYState
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'gto_bounded_a9_20261025.json'
COMMAND=['node','--import','tsx','scripts/audit_bounded_a9_20261025.ts']

def run():
 cases=[]
 for fixture in ['endgame','endgame-reply','response-bounds','forced-win','joint-forced-win','shared-four-proof']:
  state=json.loads((ROOT/f'src/logic/fixtures/{fixture}.json').read_text())['state']
  cases.append(dict(name=fixture,state=state,seed=107525001))
 result=dict(complete=False,scope='Integration fixtures only; no selection/confirmation or strength evaluation',
  plan=dict(caps=[0,1000,20_000_000],samples=64,stateless=True,fresh=2,reuse=2,overall_seconds=300),cases=cases,rows=[])
 deadline=time.time()+300
 def call(probe,case,cap,history,generation='a9'):
  if time.time()>deadline:raise TimeoutError('Overall diagnostic deadline')
  r=probe.call(dict(state=case['state'],seed=case['seed'],proofLimit=cap,generation=generation))
  assert r['diagnostics']['completedBeliefSamples']==64,(case['name'],r)
  assert sum(p['used'] for p in r['proofs'])<=3*cap
  assert all(p['used']<=cap and (p['status']!='incomplete' or not p['hasResult']) for p in r['proofs'])
  result['rows'].append(dict(case=case['name'],cap=cap,history=history,generation=generation,**r))
  OUT.write_text(json.dumps(result,indent=2)+'\n')
  return r
 with DiagnosticProbe(COMMAND) as reuse,Bridge() as bridge:
  for case in cases:
   base=call(reuse,case,0,'baseline','a7')
   for cap in result['plan']['caps']:
    matches=[]
    for history in ['fresh','fresh','reuse','reuse']:
     if history=='fresh':
      with DiagnosticProbe(COMMAND) as fresh:r=call(fresh,case,cap,history)
     else:r=call(reuse,case,cap,history)
     state=XYState(bridge,case['state']);assert r['action'] in state.legal_actions();state.apply_action(r['action'])
     assert not r['diagnostics']['usedForcedWinContinuation']
     matches.append((r['action'],r['proofs'],r['diagnostics']))
     if cap<=1000:
      assert r['action']==base['action']
      assert r['move']==r['baseline']
      assert r['diagnostics']['exactEndgameWorlds']==0
      assert not r['diagnostics']['usedDominanceOverride'] and not r['diagnostics']['forcedWinPlanLength']
    assert all(m==matches[0] for m in matches)
   with DiagnosticProbe() as original:
    old=original.call(dict(state=case['state'],seed=case['seed'],frozenClock=True))
   high=next(r for r in reversed(result['rows']) if r['case']==case['name'] and r['cap']==20_000_000)
   assert old['action']==high['action'],case['name']
   result['rows'].append(dict(case=case['name'],history='original-fresh',**old))
 result['complete']=True;OUT.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(dict(complete=True,rows=len(result['rows']),caps=result['plan']['caps'])))
if __name__=='__main__':run()
