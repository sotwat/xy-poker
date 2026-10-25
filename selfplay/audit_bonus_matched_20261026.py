"""Bonus versus deferral choices on predeclared saved learner roots."""
import fcntl
import hashlib
import json
import time
from contextlib import ExitStack
from pathlib import Path

import numpy as np
import torch

from audit_root_prior_20261025 import search
from audit_terminal_prior_20261025 import COMMAND
from audit_value_search import digest
from diagnostic_probe import DiagnosticProbe
from environment import Bridge, XYState, resample
from train import PolicyValue, load_checkpoint, paired_state

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'gto_bonus_matched_20261026.json'
PLAN = json.loads((ROOT / 'gto_bonus_matched_plan_20261026.json').read_text())


def earns_bonus(state, action):
    actor = state.current_player()
    col = (action % 10) // 2
    own = state.data['players'][actor]['board']
    other = state.data['players'][1 - actor]['board']
    return own[1][col] is not None and own[2][col] is None and other[2][col] is None


def matched_keys(state):
    classes = {key: set() for key in (True, False)}
    for a in state.legal_actions():
        classes[earns_bonus(state, a)].add((a // 10, a % 2))
    return classes[True] & classes[False]


def choose_matched(state, policy, prior):
    candidates = []
    for key in sorted(matched_keys(state)):
        arms = {}
        for name, bonus in [('bonus', True), ('defer', False)]:
            legal = [a for a in state.legal_actions() if (a // 10, a % 2) == key and earns_bonus(state, a) == bonus]
            arms[name] = min(legal, key=lambda a: (-policy.get(a, 0), -prior.get(a, 0), a))
        candidates.append((key, arms))
    assert candidates
    return min(candidates, key=lambda x: (-sum(policy.get(a, 0) for a in x[1].values()), -sum(prior.get(a, 0) for a in x[1].values()), x[0]))[1]


def run():
    torch.set_num_threads(1)
    live = ROOT / '.selfplay/final-verification'
    assert (live / 'stop.flag').exists()
    with ExitStack() as stack:
        for name in ('supervisor.lock', 'run.lock'):
            f = stack.enter_context((live / name).open('a+'))
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = hashlib.sha256((live / 'latest.pt').read_bytes()).hexdigest()
        sources, screening = [], []
        seen = set()
        with Bridge() as screen_bridge:
            for line in (live / 'events.jsonl').open():
                e = json.loads(line)
                if e.get('event') != 'selfplay' or e.get('opponent') != 'self' or e['total_games'] < 14400:
                    continue
                m = e['match']
                if m['seed'] in seen:
                    continue
                seen.add(m['seed'])
                state = paired_state(screen_bridge, m['seed'], m['swap'])
                for action in m['actions'][:17]:
                    state.apply_action(action)
                keys = matched_keys(state)
                screening.append(dict(total_games=e['total_games'], seed=m['seed'], common_keys=sorted(keys), accepted=bool(keys), reason='eligible' if keys else 'no same-card/concealment key in both classes'))
                if keys:
                    sources.append(e)
                if len(sources) == 4:
                    break
        assert len(sources) == 4
        saved = load_checkpoint(live / 'a9-milestones/games-00014000/model.pt')
        model = PolicyValue(saved['config']['width']).eval()
        model.load_state_dict(saved['model'])
        result = dict(complete=False, source=sources, model_sha256=saved['model_sha256'],
                      live_before_sha256=before, rows=[], screening=screening, plan=PLAN)
        wall, mono = time.time() + 1200, time.monotonic() + 1200

        def save():
            OUT.write_text(json.dumps(result, indent=2) + '\n')

        def check():
            if time.time() >= wall or time.monotonic() >= mono:
                raise TimeoutError('Bonus diagnostic deadline')

        def call(probe, state, seed):
            check()
            probe.timeout = min(90, wall - time.time(), mono - time.monotonic())
            r = probe.call(dict(state=state, seed=seed, proofLimit=1_000_000))
            check()
            assert r['diagnostics']['completedBeliefSamples'] == 64
            assert not r['diagnostics']['usedForcedWinContinuation']
            assert all(p['used'] <= 1_000_000 and (p['status'] != 'incomplete' or not p['hasResult']) for p in r['proofs'])
            return r

        save()
        try:
            with Bridge() as bridge, DiagnosticProbe(COMMAND) as probe:
                for index, source in enumerate(sources):
                    m = source['match']
                    for mirror in (False, True):
                        n = 17
                        state = paired_state(bridge, m['seed'], bool(m['swap']) ^ mirror)
                        for a in m['actions'][:n]:
                            state.apply_action(a)
                        assert matched_keys(state)
                        actor = state.current_player()
                        seed = m['seed'] ^ 0x102682
                        null = [call(probe, state.data, seed), call(probe, state.data, seed)]
                        with DiagnosticProbe(COMMAND) as fresh:
                            null.append(call(fresh, state.data, seed))
                        assert len({r['action'] for r in null}) == 1
                        rng = np.random.RandomState(seed ^ 0x812)
                        worlds = [XYState(bridge, resample(state.data, actor, rng)) for _ in range(8)]
                        tree = search(state, model, worlds, seed ^ 0x321, 'learned', null[0]['action'], mono)
                        policy, prior = dict(tree['policy']), dict(tree['prior'])
                        arms = choose_matched(state, policy, prior)
                        assert arms['bonus'] // 10 == arms['defer'] // 10
                        assert arms['bonus'] % 2 == arms['defer'] % 2
                        outcomes = {}
                        for name, action in arms.items():
                            trial = state.clone()
                            count = trial.data['players'][actor]['bonusesClaimed']
                            trial.apply_action(action)
                            assert trial.data['players'][actor]['bonusesClaimed'] - count == int(name == 'bonus')
                            moves, calls = [action], []
                            while not trial.is_terminal():
                                r = call(probe, trial.data, seed + len(moves))
                                trial.apply_action(r['action'])
                                moves.append(r['action'])
                                calls.append(r)
                            scores = [p['score'] for p in trial.data['players']]
                            outcomes[name] = dict(moves=moves, calls=calls, final=trial.data,
                                                  utility=float(trial.returns()[actor]), score_margin=scores[actor]-scores[1-actor])
                        result['rows'].append(dict(group='selection' if index < 2 else 'confirmation', seed=m['seed'],
                                                   mirror=mirror, swap=bool(m['swap']) ^ mirror, prefix=m['actions'][:n],
                                                   root=state.data, actor=actor, null=null, search=tree, arms=arms,
                                                   world_pool=[w.data for w in worlds], world_pool_sha256=digest([w.data for w in worlds]), outcomes=outcomes))
                        save()
                        print(json.dumps(dict(rows=len(result['rows']), seed=m['seed'], prefix=n,
                                              utilities={k:v['utility'] for k,v in outcomes.items()})), flush=True)
            result['complete'] = True
        except Exception as error:
            result['failure'] = dict(type=type(error).__name__, message=str(error))
            raise
        finally:
            result['live_after_sha256'] = hashlib.sha256((live / 'latest.pt').read_bytes()).hexdigest()
            save()
            assert result['live_after_sha256'] == before


if __name__ == '__main__':
    run()
