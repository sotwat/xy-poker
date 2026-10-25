"""Compare continuation policies from the predeclared early saved roots."""
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
OUT = ROOT / 'gto_policy_continuation_20261026.json'
PLAN = json.loads((ROOT / 'gto_target_semantics_plan_20261026.json').read_text())


def sources_from(path):
    sources, seen = [], set()
    for line in path.open():
        e = json.loads(line)
        if e.get('event') != 'selfplay' or e.get('opponent') != 'baseline' or e['total_games'] < 15000:
            continue
        seed = e['match']['seed']
        if seed in seen:
            continue
        seen.add(seed)
        assert len(e['match']['actions']) == 31
        sources.append(e)
        if len(sources) == 4:
            return sources
    raise ValueError('Four baseline source games at/after15000 required')


def run():
    torch.set_num_threads(1)
    live = ROOT / '.selfplay/final-verification'
    assert (live / 'stop.flag').exists() and not OUT.exists()
    with ExitStack() as stack:
        for name in ('supervisor.lock', 'run.lock'):
            handle = stack.enter_context((live / name).open('a+'))
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = hashlib.sha256((live / 'latest.pt').read_bytes()).hexdigest()
        sources = sources_from(live / 'events.jsonl')
        frozen = ROOT / '.selfplay/diagnostic-target-semantics-20261026/checkpoint.pt'
        saved = load_checkpoint(frozen)
        model = PolicyValue(saved['config']['width']).eval()
        model.load_state_dict(saved['model'])
        result = dict(complete=False, plan=PLAN, source=sources, rows=[],
                      model_sha256=saved['model_sha256'], frozen_sha256=hashlib.sha256(frozen.read_bytes()).hexdigest(),
                      live_before_sha256=before, started_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
        wall, mono = time.time() + 1200, time.monotonic() + 1200

        def save():
            OUT.write_text(json.dumps(result, indent=2) + '\n')

        def check():
            if time.time() >= wall or time.monotonic() >= mono:
                raise TimeoutError('Continuation diagnostic deadline')

        def call(probe, state, seed):
            check()
            probe.timeout = min(90, wall - time.time(), mono - time.monotonic())
            reply = probe.call(dict(state=state.data, seed=seed, proofLimit=1_000_000))
            check()
            assert reply['action'] in state.legal_actions()
            assert reply['diagnostics']['completedBeliefSamples'] == 64
            assert not reply['diagnostics']['usedForcedWinContinuation']
            assert all(p['used'] <= 1_000_000 and (p['status'] != 'incomplete' or not p['hasResult']) for p in reply['proofs'])
            return reply

        save()
        try:
            with Bridge() as bridge, DiagnosticProbe(COMMAND) as probe:
                for index, source in enumerate(sources):
                    match = source['match']
                    for mirror in (False, True):
                        state = paired_state(bridge, match['seed'], bool(match['swap']) ^ mirror)
                        for action in match['actions'][:5]:
                            state.apply_action(action)
                        actor = match['model_seat'] ^ int(mirror)
                        seed = match['seed'] ^ 0x102686
                        null = [call(probe, state, seed), call(probe, state, seed)]
                        with DiagnosticProbe(COMMAND) as fresh:
                            null.append(call(fresh, state, seed))
                        assert len({r['action'] for r in null}) == 1
                        with torch.no_grad():
                            from environment import features
                            root_value = float(model(torch.from_numpy(features(state.data, actor)))[1])
                        row = dict(group='selection' if index < 2 else 'confirmation', seed=match['seed'],
                                   mirror=mirror, swap=bool(match['swap']) ^ mirror, actor=actor,
                                   prefix=match['actions'][:5], root=state.data, root_value=root_value,
                                   original_logged_z=match['returns'][match['model_seat']], null=null, outcomes={})
                        result['rows'].append(row)
                        save()
                        for arm in ('learner', 'teacher'):
                            trial = state.clone()
                            moves, decisions = [], []
                            outcome = dict(complete=False, moves=moves, decisions=decisions)
                            row['outcomes'][arm] = outcome
                            while not trial.is_terminal():
                                check()
                                step = len(moves)
                                decision_seed = seed + step
                                player = trial.current_player()
                                if arm == 'learner' and player == actor:
                                    world_seed = decision_seed ^ 0x812
                                    rng = np.random.RandomState(world_seed)
                                    worlds = [XYState(bridge, resample(trial.data, player, rng)) for _ in range(8)]
                                    tree = search(trial, model, worlds, decision_seed ^ 0x321, 'learned', -1, mono)
                                    check()
                                    action = tree['action']
                                    decision = dict(kind='learner', seed=decision_seed, world_seed=world_seed,
                                                    world_hash=digest([w.data for w in worlds]), search=tree)
                                else:
                                    reply = call(probe, trial, decision_seed)
                                    action = reply['action']
                                    decision = dict(kind='teacher', seed=decision_seed, reply=reply)
                                assert action in trial.legal_actions()
                                trial.apply_action(action)
                                moves.append(action)
                                decisions.append(decision)
                                save()
                            scores = [p['score'] for p in trial.data['players']]
                            outcome.update(complete=True, final=trial.data, utility=float(trial.returns()[actor]),
                                           score_margin=scores[actor] - scores[1-actor])
                            save()
                        print(json.dumps(dict(rows=len(result['rows']), seed=match['seed'], mirror=mirror,
                                              utilities={k:v['utility'] for k,v in row['outcomes'].items()})), flush=True)
            result['complete'] = True
        except Exception as error:
            result['failure'] = dict(type=type(error).__name__, message=str(error))
            raise
        finally:
            result['finished_utc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            result['live_after_sha256'] = hashlib.sha256((live / 'latest.pt').read_bytes()).hexdigest()
            save()
            assert result['live_after_sha256'] == before


if __name__ == '__main__':
    run()
