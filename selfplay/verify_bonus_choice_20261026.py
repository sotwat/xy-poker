"""Replay bonus/defer interventions and retain deal-level dependence."""
import hashlib
import json
from pathlib import Path

import numpy as np

from audit_value_search import digest
from environment import Bridge, resample
from train import paired_state

ROOT = Path(__file__).resolve().parents[1]


def run():
    path = ROOT / 'gto_bonus_choice_20261026.json'
    raw = path.read_bytes()
    d = json.loads(raw)
    assert d['complete'] and len(d['source']) == 4
    assert d['live_before_sha256'] == d['live_after_sha256']
    summary = dict(input_sha256=hashlib.sha256(raw).hexdigest(), roots=len(d['rows']),
                   continuations=0, moves=0, null_decisions=0, continuation_decisions=0,
                   proof_calls=0, incomplete_proofs=0, groups={})
    with Bridge() as bridge:
        for source in d['source']:
            m = source['match']
            s = paired_state(bridge, m['seed'], m['swap'])
            for a in m['actions']:
                s.apply_action(a)
            assert s.is_terminal() and list(s.returns()) == m['returns']
            assert [p['score'] for p in s.data['players']] == m['scores']
        for row in d['rows']:
            source = next(x for x in d['source'] if x['match']['seed'] == row['seed'])
            i = d['source'].index(source)
            assert row['group'] == ('selection' if i < 2 else 'confirmation')
            assert row['swap'] == (bool(source['match']['swap']) ^ row['mirror'])
            assert row['prefix'] == source['match']['actions'][:len(row['prefix'])]
            s = paired_state(bridge, row['seed'], row['swap'])
            for a in row['prefix']:
                s.apply_action(a)
            assert s.data == row['root'] and s.current_player() == row['actor']
            actor = row['actor']
            seed = row['seed'] ^ 0x102682
            rng = np.random.RandomState(seed ^ 0x812)
            worlds = [resample(s.data, actor, rng) for _ in range(8)]
            assert worlds == row['world_pool'] and digest(worlds) == row['world_pool_sha256']
            assert len({r['action'] for r in row['null']}) == 1
            assert sum(row['search']['visits'].values()) == 127
            policy, prior = dict(row['search']['policy']), dict(row['search']['prior'])
            classes = {True: [], False: []}
            for a in s.legal_actions():
                t = s.clone()
                t.apply_action(a)
                delta = t.data['players'][actor]['bonusesClaimed'] - s.data['players'][actor]['bonusesClaimed']
                assert delta in (0, 1)
                classes[bool(delta)].append(a)
            assert all(classes.values())
            for name, key in [('bonus', True), ('defer', False)]:
                chosen = min(classes[key], key=lambda a: (-policy.get(a, 0), -prior.get(a, 0), a))
                assert chosen == row['arms'][name]
                out = row['outcomes'][name]
                assert out['moves'][0] == chosen and len(out['moves']) == 31-len(row['prefix'])
                assert len(out['calls']) == len(out['moves'])-1
                t = s.clone()
                for n, a in enumerate(out['moves']):
                    if n:
                        assert out['calls'][n-1]['action'] == a
                    t.apply_action(a)
                assert t.is_terminal() and t.data == out['final']
                assert float(t.returns()[actor]) == out['utility']
                scores = [p['score'] for p in t.data['players']]
                assert scores[actor]-scores[1-actor] == out['score_margin']
                summary['continuations'] += 1
                summary['moves'] += len(out['moves'])
                summary['continuation_decisions'] += len(out['calls'])
            summary['null_decisions'] += len(row['null'])
            for r in row['null']+[c for out in row['outcomes'].values() for c in out['calls']]:
                assert r['diagnostics']['completedBeliefSamples'] == 64
                assert not r['diagnostics']['usedForcedWinContinuation']
                for p in r['proofs']:
                    assert p['used'] <= 1_000_000
                    if p['status'] == 'incomplete':
                        assert not p['hasResult']
                    summary['proof_calls'] += 1
                    summary['incomplete_proofs'] += int(p['status'] == 'incomplete')
    for group in ['selection', 'confirmation']:
        rows = [r for r in d['rows'] if r['group'] == group]
        pairs = []
        for seed in sorted({r['seed'] for r in rows}):
            pair = [r for r in rows if r['seed'] == seed]
            assert len(pair) == 2
            pairs.append(dict(seed=seed, utility_bonus_minus_defer=sum(r['outcomes']['bonus']['utility']-r['outcomes']['defer']['utility'] for r in pair)/2,
                              score_margin_bonus_minus_defer=sum(r['outcomes']['bonus']['score_margin']-r['outcomes']['defer']['score_margin'] for r in pair)/2))
        summary['groups'][group] = dict(roots=len(rows), pairs=pairs,
                                       utilities={mode:[r['outcomes'][mode]['utility'] for r in rows] for mode in ['bonus', 'defer']})
    (ROOT / 'gto_bonus_choice_summary_20261026.json').write_text(json.dumps(summary, indent=2)+'\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    run()
