"""Clock/CPU checks on the historical outlier input and a fixed root control."""
import json
import time
from pathlib import Path
from diagnostic_probe import DiagnosticProbe
from environment import Bridge, XYState

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'gto_probe_clocks_20261025.json'

def run():
 prior=json.loads((ROOT/'gto_early_prior_20261025.json').read_text())
 row=next(r for r in prior['rows'] if r['seed']==1361630053 and r['mirror'] and len(r['prefix'])==9)
 with Bridge() as bridge:
  state=XYState(bridge,row['root'])
  for action in row['outcomes']['442']['moves'][:2]:state.apply_action(action)
  cases=[dict(name='historical_outlier',state=state.data,seed=row['decision_seed']+2,
              previous_action=row['outcomes']['442']['calls'][1]['action']),
         dict(name='selection_root_control',state=prior['rows'][1]['root'],seed=prior['rows'][1]['decision_seed'],
              previous_action=prior['rows'][1]['teacher'])]
 result=dict(complete=False,cases=cases,rows=[],plan=dict(samples=64,timeout_seconds=90,total_wall_seconds=300,
  repetitions=dict(frozen_fresh=2,frozen_reuse=2,timed_reuse=1),scope='Timing mechanism only; no strength games'))
 deadline=time.time()+300
 OUT.write_text(json.dumps(result,indent=2)+'\n')
 for case in cases:
  for history in ('fresh','reuse'):
   def call(probe,clock):
    if time.time()>deadline:raise TimeoutError('Overall wall deadline')
    r=probe.call(dict(state=case['state'],seed=case['seed'],frozenClock=clock=='frozen'))
    assert r['wallFinishedMs']>=r['wallStartedMs'] and r['cpuUserMs']+r['cpuSystemMs']>0
    result['rows'].append(dict(case=case['name'],history=history,clock=clock,**r))
    OUT.write_text(json.dumps(result,indent=2)+'\n')
   if history=='fresh':
    for _ in range(2):
     with DiagnosticProbe() as probe:call(probe,'frozen')
   else:
    with DiagnosticProbe() as probe:
     call(probe,'frozen');call(probe,'frozen');call(probe,'timed')
  frozen=[r for r in result['rows'] if r['case']==case['name'] and r['clock']=='frozen']
  assert len(frozen)==4 and {r['action'] for r in frozen}=={case['previous_action']}
  assert all(r['diagnostics']['completedBeliefSamples']==64 for r in frozen)
 with Bridge() as bridge:
  for r in result['rows']:
   case=next(c for c in cases if c['name']==r['case']);state=XYState(bridge,case['state'])
   assert r['action'] in state.legal_actions();state.apply_action(r['action'])
 result['complete']=True;OUT.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps([dict(case=r['case'],clock=r['clock'],history=r['history'],action=r['action'],samples=r['diagnostics']['completedBeliefSamples'],cpuMs=r['cpuUserMs']+r['cpuSystemMs'],elapsedMs=r['actualElapsedMs'],wallMs=r['wallFinishedMs']-r['wallStartedMs']) for r in result['rows']],indent=2))

if __name__=='__main__':run()
