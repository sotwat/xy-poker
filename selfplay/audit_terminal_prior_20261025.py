"""Predeclared early root-prior intervention with bounded diagnostic A9 terminal play."""
import json,time
from pathlib import Path
import numpy as np
import torch
from diagnostic_probe import DiagnosticProbe
from audit_root_prior_20261025 import search
from audit_value_search import digest
from environment import Bridge,XYState,resample
from train import PolicyValue,load_checkpoint,paired_state
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'gto_terminal_prior_20261025.json'
COMMAND=['node','--import','tsx','scripts/audit_bounded_a9_20261025.ts']

def run():
 torch.set_num_threads(1)
 sources=[]
 for line in (ROOT/'.selfplay/final-verification/events.jsonl').open():
  e=json.loads(line)
  if e.get('event')=='selfplay' and e.get('opponent')=='self' and e['total_games']>=12904:
   if all(r['match']['seed']!=e['match']['seed'] for r in sources):sources.append(e)
   if len(sources)==4:break
 assert len(sources)==4
 saved=load_checkpoint(ROOT/'.selfplay/final-verification/a9-milestones/games-00012000/model.pt')
 model=PolicyValue(saved['config']['width']).eval();model.load_state_dict(saved['model'])
 result=dict(complete=False,source=sources,model_sha256=saved['model_sha256'],rows=[],plan=dict(
  prefix=9,simulations=128,worlds=8,modes=['learned','teacher50'],proof_cap=1_000_000,
  samples=64,stateless=True,selection_indices=[0,1],confirmation_indices=[2,3],
  mechanism_gate='Within each group no negative paired utility sum and at least one positive paired sum; no live adoption from this pilot',
  scope='Correlated saved learner states, both sides switched to diagnostic bounded A9 after root. Not production A9 strength or independent heldout games',
  seconds=1200))
 OUT.write_text(json.dumps(result,indent=2)+'\n')
 wall=time.time()+1200;mono=time.monotonic()+1200
 def check():
  if time.time()>=wall or time.monotonic()>=mono:raise TimeoutError('Overall terminal diagnostic deadline')
 def call(probe,state,seed):
  check();probe.timeout=min(90,wall-time.time(),mono-time.monotonic())
  r=probe.call(dict(state=state,seed=seed,proofLimit=1_000_000))
  check();assert r['diagnostics']['completedBeliefSamples']==64
  assert not r['diagnostics']['usedForcedWinContinuation']
  assert all(p['used']<=1_000_000 and (p['status']!='incomplete' or not p['hasResult']) for p in r['proofs'])
  return r
 try:
  with Bridge() as bridge,DiagnosticProbe(COMMAND) as probe:
   for index,source in enumerate(sources):
    m=source['match'];seed=m['seed']
    for mirror in (False,True):
     state=paired_state(bridge,seed,bool(m['swap'])^mirror)
     for a in m['actions'][:9]:state.apply_action(a)
     actor=state.current_player();decision_seed=(seed^0x7521)+9
     null=[call(probe,state.data,decision_seed),call(probe,state.data,decision_seed)]
     with DiagnosticProbe(COMMAND) as fresh:null.append(call(fresh,state.data,decision_seed))
     assert len({r['action'] for r in null})==1
     teacher=null[0]['action'];rng=np.random.RandomState(seed^0x7541)
     worlds=[XYState(bridge,resample(state.data,actor,rng)) for _ in range(8)]
     arms={mode:search(state,model,worlds,seed^0x7561,mode,teacher,mono) for mode in ['learned','teacher50']}
     outcomes={}
     for action in sorted({a['action'] for a in arms.values()}):
      trial=state.clone();trial.apply_action(action);moves=[action];calls=[]
      while not trial.is_terminal():
       assert len(moves)<31
       reply=call(probe,trial.data,decision_seed+len(moves));trial.apply_action(reply['action'])
       moves.append(reply['action']);calls.append(reply)
      scores=[p['score'] for p in trial.data['players']]
      outcomes[str(action)]=dict(moves=moves,calls=calls,final=trial.data,
       utility=float(trial.returns()[actor]),score_margin=scores[actor]-scores[1-actor])
     result['rows'].append(dict(group='selection' if index<2 else 'confirmation',seed=seed,mirror=mirror,
      swap=bool(m['swap'])^mirror,prefix=m['actions'][:9],root=state.data,actor=actor,
      decision_seed=decision_seed,null=null,arms=arms,world_pool=[w.data for w in worlds],world_pool_sha256=digest([w.data for w in worlds]),outcomes=outcomes))
     OUT.write_text(json.dumps(result,indent=2)+'\n')
     print(json.dumps(dict(row=len(result['rows']),seed=seed,mirror=mirror,utilities={mode:outcomes[str(a['action'])]['utility'] for mode,a in arms.items()})),flush=True)
 except Exception as error:
  result['failure']=dict(type=type(error).__name__,message=str(error));OUT.write_text(json.dumps(result,indent=2)+'\n');raise
 result['complete']=True;OUT.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':run()
