"""Fixed-work early/mid root interventions with a bounded four-action horizon."""
import json
import time
from pathlib import Path
import numpy as np
import torch
from diagnostic_probe import DiagnosticProbe as Probe
from audit_root_prior_20261025 import search
from audit_value_search import digest
from environment import Bridge, XYState, resample
from train import PolicyValue, Evaluator, load_checkpoint, paired_state

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'gto_early_prior_20261025.json'

def validate_call_budget(reply, wall_deadline):
    if reply['actualElapsedMs'] > 90_000 or time.time() > wall_deadline:
        raise TimeoutError('Returned probe exceeded elapsed/wall diagnostic budget')
    return reply

def run():
    torch.set_num_threads(1)
    deadline=time.monotonic()+1200
    wall_deadline=time.time()+1200
    def check():
        if time.monotonic()>deadline or time.time()>wall_deadline:raise TimeoutError('20 minute diagnostic limit')
    sources=[]
    for line in (ROOT/'.selfplay/final-verification/events.jsonl').open():
        event=json.loads(line)
        if event.get('event')=='selfplay' and event.get('opponent')=='self' and event['total_games']>=12800:
            if not any(r['match']['seed']==event['match']['seed'] for r in sources):sources.append(event)
            if len(sources)==4:break
    assert len(sources)==4
    saved=load_checkpoint(ROOT/'.selfplay/final-verification/a9-milestones/games-00012000/model.pt')
    model=PolicyValue(saved['config']['width']).eval();model.load_state_dict(saved['model'])
    result=dict(complete=False,source=sources,model_sha256=saved['model_sha256'],rows=[],plan=dict(
        prefixes=[9,17],modes=['learned','uniform','teacher50'],simulations=128,worlds=8,
        continuation_actions_including_root=4,teacher_samples=64,frozen_clock=True,
        selection_source_indices=[0,1],confirmation_source_indices=[2,3],null_repeats=3,
        scope='Correlated saved training deals; four-action horizon, no terminal utility or strength inference',
        endpoint='Frozen network value oriented to root player; unvalidated surrogate, not adoption criterion'))
    OUT.write_text(json.dumps(result,indent=2)+'\n')
    def call(probe, request):
        check()
        reply=None
        try:
            reply=probe.call(request)
            return validate_call_budget(reply,wall_deadline)
        except TimeoutError:
            result['budget_failure']=dict(request=request,reply=reply)
            OUT.write_text(json.dumps(result,indent=2)+'\n')
            raise
    with Bridge() as bridge, Probe() as probe:
        evaluator=Evaluator(model,check,np.random.RandomState(271))
        for index,source in enumerate(sources):
            match=source['match'];seed=match['seed']
            for mirror in (False,True):
                for prefix in result['plan']['prefixes']:
                    check();state=paired_state(bridge,seed,bool(match['swap'])^mirror)
                    for a in match['actions'][:prefix]:state.apply_action(a)
                    player=state.current_player();decision_seed=(seed^0x7251)+prefix
                    request=dict(state=state.data,seed=decision_seed,frozenClock=True)
                    null=[call(probe,request),call(probe,request)]
                    with Probe() as fresh:null.append(call(fresh,request))
                    assert len({r['action'] for r in null})==1
                    for r in null:
                        d=r['diagnostics'];assert d['completedBeliefSamples']==64 and d['exactEndgameWorlds']==0
                        assert not d['usedForcedWinContinuation'] and not d['usedDominanceOverride'] and d['forcedWinPlanLength']==0
                    teacher=null[0]['action'];rng=np.random.RandomState(seed^prefix^0x7281)
                    worlds=[XYState(bridge,resample(state.data,player,rng)) for _ in range(8)]
                    arms={mode:search(state,model,worlds,seed^prefix^0x7291,mode,teacher,deadline) for mode in result['plan']['modes']}
                    outcomes={}
                    for action in sorted({teacher,*(arm['action'] for arm in arms.values())}):
                        trial=state.clone();trial.apply_action(action);moves=[action];calls=[]
                        for offset in range(1,4):
                            check();reply=call(probe,dict(state=trial.data,seed=decision_seed+offset,frozenClock=True))
                            d=reply['diagnostics'];assert d['completedBeliefSamples']==64 and d['exactEndgameWorlds']==0
                            assert not d['usedForcedWinContinuation'] and not d['usedDominanceOverride'] and d['forcedWinPlanLength']==0
                            trial.apply_action(reply['action']);moves.append(reply['action']);calls.append(reply)
                        assert not trial.is_terminal()
                        value=float(evaluator.infer(trial)[2])
                        outcomes[str(action)]=dict(moves=moves,calls=calls,endpoint=trial.data,
                            root_oriented_value=value if trial.current_player()==player else -value)
                    result['rows'].append(dict(group='selection' if index<2 else 'confirmation',seed=seed,mirror=mirror,
                        swap=bool(match['swap'])^mirror,prefix=match['actions'][:prefix],root=state.data,player=player,
                        decision_seed=decision_seed,null=null,teacher=teacher,arms=arms,outcomes=outcomes,
                        world_pool_sha256=digest([w.data for w in worlds])))
                    OUT.write_text(json.dumps(result,indent=2)+'\n')
                    print(json.dumps(dict(rows=len(result['rows']),seed=seed,prefix=prefix,mirror=mirror)),flush=True)
    result['complete']=True;OUT.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':run()
