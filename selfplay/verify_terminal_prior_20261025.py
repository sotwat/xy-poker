"""Replay all saved terminal interventions; summarize by paired source deal."""
import json
from pathlib import Path
import numpy as np
from audit_value_search import digest
from train import paired_state
from environment import Bridge,resample
ROOT=Path(__file__).resolve().parents[1]

def run():
 d=json.loads((ROOT/'gto_terminal_prior_20261025.json').read_text());assert d['complete'] and len(d['rows'])==8
 summary=dict(scope=d['plan']['scope'],sources=4,roots=8,continuations=0,null_decisions=24,continuation_decisions=0,
  proof_calls=0,incomplete_proofs=0,completed_nonempty_proofs=0,groups={})
 with Bridge() as bridge:
  for source in d['source']:
   m=source['match'];s=paired_state(bridge,m['seed'],m['swap'])
   for a in m['actions']:s.apply_action(a)
   assert s.is_terminal() and list(s.returns())==m['returns']
   assert [p['score'] for p in s.data['players']]==m['scores']
  for row in d['rows']:
   source=next(s for s in d['source'] if s['match']['seed']==row['seed']);index=d['source'].index(source)
   assert row['group']==('selection' if index<2 else 'confirmation')
   assert row['swap']==(bool(source['match']['swap'])^row['mirror'])
   assert row['prefix']==source['match']['actions'][:9]
   s=paired_state(bridge,row['seed'],row['swap'])
   for a in row['prefix']:s.apply_action(a)
   assert s.data==row['root'] and s.current_player()==row['actor']
   rng=np.random.RandomState(row['seed']^0x7541)
   worlds=[resample(s.data,row['actor'],rng) for _ in range(8)]
   assert worlds==row['world_pool'] and digest(worlds)==row['world_pool_sha256']
   assert len({r['action'] for r in row['null']})==1
   for arm in row['arms'].values():
    assert sum(arm['visits'].values())==127 and abs(sum(p for _,p in arm['prior'])-1)<1e-6
   for action,out in row['outcomes'].items():
    t=s.clone();assert out['moves'][0]==int(action) and len(out['moves'])==22 and len(out['calls'])==21
    for n,a in enumerate(out['moves']):
     if n:assert out['calls'][n-1]['action']==a
     t.apply_action(a)
    assert t.is_terminal() and t.data==out['final']
    assert float(t.returns()[row['actor']])==out['utility']
    scores=[p['score'] for p in t.data['players']]
    assert scores[row['actor']]-scores[1-row['actor']]==out['score_margin']
    summary['continuations']+=1;summary['continuation_decisions']+=len(out['calls'])
   for r in row['null']+[c for out in row['outcomes'].values() for c in out['calls']]:
    assert r['diagnostics']['completedBeliefSamples']==64 and not r['diagnostics']['usedForcedWinContinuation']
    assert len(r['proofs'])<=3
    for proof in r['proofs']:
     assert proof['used']<=1_000_000
     if proof['status']=='incomplete':assert not proof['hasResult']
     summary['proof_calls']+=1
     summary['incomplete_proofs']+=int(proof['status']=='incomplete')
     summary['completed_nonempty_proofs']+=int(proof['hasResult'])
 for group in ['selection','confirmation']:
  rows=[r for r in d['rows'] if r['group']==group]
  def outcome(row,mode):return row['outcomes'][str(row['arms'][mode]['action'])]
  pairs=[]
  for seed in sorted({r['seed'] for r in rows}):
   pair=[r for r in rows if r['seed']==seed];assert len(pair)==2
   pairs.append(dict(seed=seed,utility_delta_mean=sum(outcome(r,'teacher50')['utility']-outcome(r,'learned')['utility'] for r in pair)/2,
    score_margin_delta_mean=sum(outcome(r,'teacher50')['score_margin']-outcome(r,'learned')['score_margin'] for r in pair)/2))
  summary['groups'][group]=dict(utilities={mode:[outcome(r,mode)['utility'] for r in rows] for mode in ['learned','teacher50']},pairs=pairs,
   paired_utility_delta_mean=sum(p['utility_delta_mean'] for p in pairs)/2,
   mechanism_gate=all(p['utility_delta_mean']>=0 for p in pairs) and any(p['utility_delta_mean']>0 for p in pairs))
 summary['pilot_gate']=all(g['mechanism_gate'] for g in summary['groups'].values())
 (ROOT/'gto_terminal_prior_summary_20261025.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
if __name__=='__main__':run()
