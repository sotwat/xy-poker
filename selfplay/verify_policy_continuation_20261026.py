"""Reconstruct policy interventions, deterministic choices and terminal returns."""
import hashlib
import json
from pathlib import Path

import numpy as np
import torch

from audit_policy_continuation_20261026 import sources_from
from audit_value_search import digest
from environment import Bridge, features, resample
from train import PolicyValue, load_checkpoint, paired_state

ROOT = Path(__file__).resolve().parents[1]


def run():
    raw = (ROOT / 'gto_policy_continuation_20261026.json').read_bytes()
    data = json.loads(raw)
    assert data['complete'] and len(data['rows']) == 8
    assert data['source'] == sources_from(ROOT / '.selfplay/final-verification/events.jsonl')
    assert data['live_before_sha256'] == data['live_after_sha256']
    summary = dict(input_sha256=hashlib.sha256(raw).hexdigest(), roots=8, continuations=0,
                   moves=0, searches=0, null_decisions=0, teacher_decisions=0,
                   proof_calls=0, incomplete_proofs=0, groups={})
    torch.set_num_threads(1)
    frozen = ROOT / '.selfplay/diagnostic-target-semantics-20261026/checkpoint.pt'
    assert hashlib.sha256(frozen.read_bytes()).hexdigest() == data['frozen_sha256']
    saved = load_checkpoint(frozen)
    assert saved['model_sha256'] == data['model_sha256']
    model = PolicyValue(saved['config']['width']).eval()
    model.load_state_dict(saved['model'])
    summary['root_values'] = []
    with Bridge() as bridge:
        for source in data['source']:
            m = source['match']
            state = paired_state(bridge, m['seed'], m['swap'])
            for a in m['actions']:
                state.apply_action(a)
            assert state.is_terminal() and list(state.returns()) == m['returns']
            assert [p['score'] for p in state.data['players']] == m['scores']
        for index, row in enumerate(data['rows']):
            source = data['source'][index // 2]
            m = source['match']
            assert row['seed'] == m['seed'] and row['mirror'] == bool(index % 2)
            assert row['group'] == ('selection' if index < 4 else 'confirmation')
            assert row['actor'] == (m['model_seat'] ^ int(row['mirror']))
            assert row['original_logged_z'] == m['returns'][m['model_seat']]
            assert row['swap'] == (bool(m['swap']) ^ row['mirror'])
            assert row['prefix'] == m['actions'][:5]
            root = paired_state(bridge, m['seed'], row['swap'])
            for a in row['prefix']:
                root.apply_action(a)
            assert root.data == row['root']
            current = root.current_player()
            with torch.no_grad():
                actor_input_value = float(model(torch.from_numpy(features(root.data, row['actor'])))[1])
                current_value = float(model(torch.from_numpy(features(root.data, current)))[1])
            assert actor_input_value == row['root_value']
            summary['root_values'].append(dict(seed=row['seed'], mirror=row['mirror'], current_player=current,
                                              actor=row['actor'], recorded_actor_input_value=actor_input_value,
                                              recorded_input_is_on_turn=current == row['actor'],
                                              current_player_value=current_value,
                                              scope='Off-turn actor-input values are descriptive and outside the training turn-role; current-player values use the trained input convention'))
            assert len(row['null']) == 3 and len({x['action'] for x in row['null']}) == 1
            assert row['null'][0]['action'] in root.legal_actions()
            all_replies = list(row['null'])
            summary['null_decisions'] += 3
            for arm, outcome in row['outcomes'].items():
                assert arm in ('learner', 'teacher') and outcome['complete']
                assert len(outcome['moves']) == len(outcome['decisions']) == 26
                trial = root.clone()
                for step, (action, decision) in enumerate(zip(outcome['moves'], outcome['decisions'])):
                    assert decision['seed'] == (row['seed'] ^ 0x102686) + step
                    learner = arm == 'learner' and trial.current_player() == row['actor']
                    assert decision['kind'] == ('learner' if learner else 'teacher')
                    if learner:
                        tree = decision['search']
                        rng = np.random.RandomState(decision['world_seed'])
                        assert decision['world_seed'] == (decision['seed'] ^ 0x812)
                        worlds = [resample(trial.data, trial.current_player(), rng) for _ in range(8)]
                        assert digest(worlds) == decision['world_hash']
                        assert sum(tree['visits'].values()) == 127
                        policy = tree['policy']
                        assert np.isclose(sum(p for _, p in policy), 1)
                        assert all(a in trial.legal_actions() and p >= 0 for a, p in policy)
                        assert action == tree['action'] == min(policy, key=lambda x: (-x[1], x[0]))[0]
                        summary['searches'] += 1
                    else:
                        assert decision['reply']['action'] == action
                        all_replies.append(decision['reply'])
                        summary['teacher_decisions'] += 1
                    assert action in trial.legal_actions()
                    trial.apply_action(action)
                assert trial.is_terminal() and trial.data == outcome['final']
                actor = row['actor']
                assert outcome['utility'] == float(trial.returns()[actor])
                scores = [p['score'] for p in trial.data['players']]
                assert outcome['score_margin'] == scores[actor] - scores[1-actor]
                summary['continuations'] += 1
                summary['moves'] += len(outcome['moves'])
            for reply in all_replies:
                assert reply['diagnostics']['completedBeliefSamples'] == 64
                assert not reply['diagnostics']['usedForcedWinContinuation']
                for proof in reply['proofs']:
                    assert proof['used'] <= 1_000_000
                    if proof['status'] == 'incomplete':
                        assert not proof['hasResult']
                        summary['incomplete_proofs'] += 1
                    summary['proof_calls'] += 1
    for group in ('selection', 'confirmation'):
        rows = [r for r in data['rows'] if r['group'] == group]
        pairs = []
        for seed in dict.fromkeys(r['seed'] for r in rows):
            pair = [r for r in rows if r['seed'] == seed]
            assert len(pair) == 2
            pairs.append(dict(seed=seed, utility_difference=sum(r['outcomes']['teacher']['utility'] - r['outcomes']['learner']['utility'] for r in pair) / 2,
                              score_difference=sum(r['outcomes']['teacher']['score_margin'] - r['outcomes']['learner']['score_margin'] for r in pair) / 2))
        summary['groups'][group] = dict(pairs=pairs, outcomes={arm:[r['outcomes'][arm]['utility'] for r in rows] for arm in ('learner','teacher')})
    (ROOT / 'gto_policy_continuation_summary_20261026.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    run()
