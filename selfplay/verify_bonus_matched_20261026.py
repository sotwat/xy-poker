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
    path = ROOT / 'gto_bonus_matched_20261026.json'
    raw = path.read_bytes()
    d = json.loads(raw)
    assert d['complete'] and len(d['source']) == 4
    assert d['live_before_sha256'] == d['live_after_sha256']
    summary = dict(input_sha256=hashlib.sha256(raw).hexdigest(), roots=len(d['rows']),
                   continuations=0, moves=0, null_decisions=0, continuation_decisions=0,
                   proof_calls=0, incomplete_proofs=0, groups={})
    with Bridge() as bridge:
        seen, actual, accepted = set(), [], []
        for line in (ROOT/'.selfplay/final-verification/events.jsonl').open():
            e = json.loads(line)
            if e.get('event') != 'selfplay' or e.get('opponent') != 'self' or e['total_games'] < 14400:
                continue
            m = e['match']
            if m['seed'] in seen:
                continue
            seen.add(m['seed'])
            t = paired_state(bridge,m['seed'],m['swap'])
            for a in m['actions'][:17]:
                t.apply_action(a)
            classes = {True:set(), False:set()}
            actor=t.current_player()
            for a in t.legal_actions():
                v=t.clone();v.apply_action(a)
                delta=v.data['players'][actor]['bonusesClaimed']-t.data['players'][actor]['bonusesClaimed']
                assert delta in (0,1)
                classes[bool(delta)].add((a//10,a%2))
            keys=classes[True]&classes[False]
            actual.append(dict(total_games=e['total_games'],seed=m['seed'],common_keys=[list(k) for k in sorted(keys)],accepted=bool(keys),reason='eligible' if keys else 'no same-card/concealment key in both classes'))
            if keys:
                accepted.append(e)
            if len(accepted)==4:
                break
        assert actual==d['screening'] and accepted==d['source']
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
            assert len(row['prefix']) == 17
            choices = []
            keys = {(a//10, a%2) for a in classes[True]} & {(a//10, a%2) for a in classes[False]}
            for card, hidden in sorted(keys):
                arms = {}
                for name, flag in [('bonus', True), ('defer', False)]:
                    valid = [a for a in classes[flag] if a//10 == card and a%2 == hidden]
                    arms[name] = sorted(valid, key=lambda a: (-policy.get(a,0), -prior.get(a,0),a))[0]
                choices.append((-(policy.get(arms['bonus'],0)+policy.get(arms['defer'],0)), -(prior.get(arms['bonus'],0)+prior.get(arms['defer'],0)), card, hidden, arms))
            matched = sorted(choices, key=lambda x: x[:4])[0][4]
            assert matched['bonus']//10 == matched['defer']//10 and matched['bonus']%2 == matched['defer']%2
            for name, key in [('bonus', True), ('defer', False)]:
                chosen = matched[name]
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
    (ROOT / 'gto_bonus_matched_summary_20261026.json').write_text(json.dumps(summary, indent=2)+'\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    run()
