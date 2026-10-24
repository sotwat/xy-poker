"""Replay early/mid interventions and check their fixed-work null controls."""
import json
import numpy as np
import torch
from audit_value_search import digest
from environment import Bridge, XYState, resample
from train import paired_state, PolicyValue, Evaluator, load_checkpoint
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def run():
 j=json.loads((ROOT/'gto_early_prior_20261025.json').read_text());assert j['complete'] and len(j['rows'])==16
 torch.set_num_threads(1)
 saved=load_checkpoint(ROOT/'.selfplay/final-verification/a9-milestones/games-00012000/model.pt')
 assert saved['model_sha256']==j['model_sha256']
 model=PolicyValue(saved['config']['width']).eval();model.load_state_dict(saved['model'])
 evaluator=Evaluator(model,lambda:None,np.random.RandomState(271))
 summary=dict(scope=j['plan']['scope'],null_decisions=0,continuations=0,continuation_decisions=0,over_90_seconds=0,groups={})
 with Bridge() as bridge:
  for source in j['source']:
   m=source['match'];s=paired_state(bridge,m['seed'],m['swap'])
   for a in m['actions']:s.apply_action(a)
   assert list(s.returns())==m['returns']
  for row in j['rows']:
   s=paired_state(bridge,row['seed'],row['swap'])
   for a in row['prefix']:s.apply_action(a)
   assert s.data==row['root'] and s.current_player()==row['player']
   assert len(row['null'])==3 and {r['action'] for r in row['null']}=={row['teacher']}
   summary['null_decisions']+=3
   rng=np.random.RandomState(row['seed']^len(row['prefix'])^0x7281)
   worlds=[resample(s.data,row['player'],rng) for _ in range(8)]
   assert digest(worlds)==row['world_pool_sha256']
   key=row['group']+'_'+str(len(row['prefix']));g=summary['groups'].setdefault(key,dict(roots=0,teacher_agreement={},changed={},endpoint_value_delta={}))
   g['roots']+=1
   for mode,arm in row['arms'].items():
    assert sum(arm['visits'].values())==127 and np.isclose(sum(p for _,p in arm['policy']),1)
    assert all(a in s.legal_actions() for a,p in arm['policy'])
    g['teacher_agreement'][mode]=g['teacher_agreement'].get(mode,0)+int(arm['action']==row['teacher'])
    g['changed'][mode]=g['changed'].get(mode,0)+int(arm['action']!=row['arms']['learned']['action'])
    baseline=row['outcomes'][str(row['arms']['learned']['action'])]['root_oriented_value']
    delta=row['outcomes'][str(arm['action'])]['root_oriented_value']-baseline
    g['endpoint_value_delta'][mode]=g['endpoint_value_delta'].get(mode,0)+delta
   for outcome in row['outcomes'].values():
    t=s.clone();assert len(outcome['moves'])==4 and len(outcome['calls'])==3
    for a in outcome['moves']:t.apply_action(a)
    assert t.data==outcome['endpoint'] and not t.is_terminal()
    value=evaluator.infer(t)[2]*(1 if t.current_player()==row['player'] else -1)
    assert np.isclose(value,outcome['root_oriented_value'],rtol=0,atol=1e-7)
    summary['continuations']+=1;summary['continuation_decisions']+=3
   for r in row['null']+[call for out in row['outcomes'].values() for call in out['calls']]:
    summary['over_90_seconds']+=int(r['actualElapsedMs']>90_000)
    d=r['diagnostics'];assert d['completedBeliefSamples']==64 and d['elapsedMs']==0 and d['exactEndgameWorlds']==0
    assert not d['usedForcedWinContinuation'] and not d['usedDominanceOverride'] and d['forcedWinPlanLength']==0
 for g in summary['groups'].values():
  g['mean_endpoint_value_delta']={m:v/g['roots'] for m,v in g.pop('endpoint_value_delta').items()}
 (ROOT/'gto_early_prior_summary_20261025.json').write_text(json.dumps(summary,indent=2)+'\n')
 print(json.dumps(summary,indent=2))
if __name__=='__main__':run()
