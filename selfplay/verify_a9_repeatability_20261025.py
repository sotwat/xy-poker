"""Validate isolated A9 repeat decisions and clock-budget mechanism summaries."""
import json
from pathlib import Path

from environment import Bridge, XYState
from train import paired_state

ROOT=Path(__file__).resolve().parents[1]


def run():
    j=json.loads((ROOT/'gto_a9_repeatability_20261025.json').read_text())
    source=json.loads((ROOT/'gto_recovery_curve_20261025.json').read_text())
    assert j['complete'] and len(j['cases'])==5 and len(j['rows'])==60
    summary=dict(cases=[],scope=j['plan']['scope'])
    with Bridge() as bridge:
        for case in j['cases']:
            control=next(r for r in source['rows'] if r['seed']==case['seed'] and r['mirror']==case['mirror'] and r['cutoff']==0)
            one=next(r for r in source['rows'] if r['seed']==case['seed'] and r['mirror']==case['mirror'] and r['cutoff']==1)
            state=paired_state(bridge,case['seed'],control['swap'])
            for a in control['moves'][:case['action_index']]:state.apply_action(a)
            assert state.data==case['state']
            other=XYState(bridge,one['root'])
            for a in one['moves'][:case['action_index']-1]:other.apply_action(a)
            assert state.data==other.data
            assert case['decision_seed']==control['continuation_seeds'][case['action_index']]==one['continuation_seeds'][case['action_index']-1]
            groups={}
            for clock in ('timed','frozen'):
                all_rows=[]
                for history in ('fresh','reuse'):
                    rows=[r for r in j['rows'] if r['seed']==case['seed'] and r['mirror']==case['mirror'] and r['clock']==clock and r['history']==history]
                    assert len(rows)==3 and sorted(r['repetition'] for r in rows)==[0,1,2]
                    for r in rows:
                        assert r['action'] in state.legal_actions()
                        trial=state.clone();trial.apply_action(r['action'])
                        d=r['diagnostics']
                        assert 0<d['completedBeliefSamples']<=64 and not d['usedForcedWinContinuation'] and d['forcedWinPlanLength']==0
                        assert d['exactEndgameWorlds']==0 and not d['usedDominanceOverride']
                        if clock=='frozen':assert d['completedBeliefSamples']==64 and d['elapsedMs']==0
                        else:assert d['elapsedMs']>0
                    groups[clock+'_'+history]=dict(actions=[r['action'] for r in rows],
                        samples=[r['diagnostics']['completedBeliefSamples'] for r in rows],
                        actual_ms=[r['actualElapsedMs'] for r in rows])
                    all_rows+=rows
                groups[clock+'_unique_actions']=sorted({r['action'] for r in all_rows})
            assert len(groups['frozen_unique_actions'])==1
            summary['cases'].append(dict(group=case['group'],seed=case['seed'],mirror=case['mirror'],action_index=case['action_index'],**groups))
    for clock in ('timed','frozen'):
        rows=[r for r in j['rows'] if r['clock']==clock]
        summary[clock]=dict(decisions=len(rows),min_samples=min(r['diagnostics']['completedBeliefSamples'] for r in rows),
                           max_samples=max(r['diagnostics']['completedBeliefSamples'] for r in rows),
                           min_actual_ms=min(r['actualElapsedMs'] for r in rows),max_actual_ms=max(r['actualElapsedMs'] for r in rows))
    summary['timed_multiaction_cases']=sum(len(c['timed_unique_actions'])>1 for c in summary['cases'])
    summary['frozen_multiaction_cases']=sum(len(c['frozen_unique_actions'])>1 for c in summary['cases'])
    (ROOT/'gto_a9_repeatability_summary_20261025.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps({k:v for k,v in summary.items() if k!='cases'},indent=2))


if __name__=='__main__':run()
