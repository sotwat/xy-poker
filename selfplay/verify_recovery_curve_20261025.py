"""Replay takeover outputs and summarize complete fixed-cutoff clusters."""
import json
from pathlib import Path

from environment import Bridge
from train import paired_state

ROOT = Path(__file__).resolve().parents[1]


def run():
    result = json.loads((ROOT / 'gto_recovery_curve_20261025.json').read_text())
    assert result['complete'] and len(result['source']) == 4 and len(result['rows']) == 40
    expected = {(e['match']['seed'], mirror, c) for e in result['source']
                for mirror in (False, True) for c in (0, 1, 9, 17, 25)}
    assert {(r['seed'], r['mirror'], r['cutoff']) for r in result['rows']} == expected
    with Bridge() as bridge:
        for source in result['source']:
            match = source['match']
            state = paired_state(bridge, match['seed'], match['swap'])
            for action in match['actions']:
                state.apply_action(action)
            assert state.is_terminal() and list(state.returns()) == match['returns']
            assert [p['score'] for p in state.data['players']] == match['scores']
        for row in result['rows']:
            source = next(e for e in result['source'] if e['match']['seed'] == row['seed'])
            assert row['group'] == ('selection' if result['source'].index(source) < 2 else 'confirmation')
            assert row['source_player'] == int(row['mirror'])
            assert row['swap'] == (bool(source['match']['swap']) ^ row['mirror'])
            assert row['prefix'] == source['match']['actions'][:row['cutoff']]
            state = paired_state(bridge, row['seed'], row['swap'])
            for action in row['prefix']:
                state.apply_action(action)
            assert state.data == row['root']
            assert row['continuation_seeds'] == [(row['seed'] ^ 0x6261) + row['cutoff'] + k for k in range(len(row['moves']))]
            assert len(row['prefix']) + len(row['moves']) == 31
            for action in row['moves']:
                state.apply_action(action)
            assert state.is_terminal() and state.data == row['final']
            seat = row['source_player']
            assert state.returns()[seat] == row['utility']
            scores = [p['score'] for p in state.data['players']]
            assert scores[seat] - scores[1-seat] == row['score_margin']
    summary = dict(scope=result['plan']['scope'], verified_sources=4, verified_roots=40,
                   verified_continuations=40, continuation_actions=sum(len(r['moves']) for r in result['rows']),
                   groups={})
    for group in ('selection', 'confirmation'):
        group_rows = [r for r in result['rows'] if r['group'] == group]
        curves = []
        for seed in sorted({r['seed'] for r in group_rows}):
            pair = [r for r in group_rows if r['seed'] == seed]
            curves.append(dict(seed=seed,
                utility_by_cutoff={c: [r['utility'] for r in pair if r['cutoff']==c] for c in (0,1,9,17,25)},
                margin_by_cutoff={c: [r['score_margin'] for r in pair if r['cutoff']==c] for c in (0,1,9,17,25)}))
        stats = {}
        for cutoff in (0, 1, 9, 17, 25):
            rows = [r for r in group_rows if r['cutoff'] == cutoff]
            controls = [next(r for r in group_rows if r['cutoff']==0 and r['seed']==x['seed'] and r['mirror']==x['mirror']) for x in rows]
            stats[cutoff] = dict(utilities=[r['utility'] for r in rows],
                mean_utility=sum(r['utility'] for r in rows)/4,
                changed_outcomes_from_control=sum(r['utility']!=c['utility'] for r,c in zip(rows,controls)),
                mean_margin=sum(r['score_margin'] for r in rows)/4,
                pair_mean_utility_delta_from_control=[sum(r['utility']-c['utility'] for r,c in zip(rows,controls) if r['seed']==seed)/2 for seed in sorted({r['seed'] for r in rows})])
        summary['groups'][group] = dict(curves=curves, cutoff_stats=stats)
    null_pairs = []
    for control in result['rows']:
        if control['cutoff'] != 0:
            continue
        one = next(r for r in result['rows'] if r['seed'] == control['seed']
                   and r['mirror'] == control['mirror'] and r['cutoff'] == 1)
        assert control['moves'][0] == one['prefix'][0]
        with Bridge() as bridge:
            state = paired_state(bridge, control['seed'], control['swap'])
            state.apply_action(control['moves'][0])
            assert state.data == one['root']
        assert control['continuation_seeds'][1:] == one['continuation_seeds']
        null_pairs.append(dict(seed=control['seed'], mirror=control['mirror'],
            identical_initial_state_and_seeds=True,
            first_divergent_absolute_action_index=next((k+1 for k,(a,b) in
                enumerate(zip(control['moves'][1:], one['moves'])) if a != b), None),
            outcome_changed=control['utility'] != one['utility']))
    summary['null_control'] = dict(pairs=null_pairs,
        different_trajectories=sum(r['first_divergent_absolute_action_index'] is not None for r in null_pairs),
        different_outcomes=sum(r['outcome_changed'] for r in null_pairs),
        limitation='Same observable/state input and requested seeds, but process call history and wall-clock budgets are not held equal')
    (ROOT / 'gto_recovery_curve_summary_20261025.json').write_text(json.dumps(summary, indent=2)+'\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    run()
