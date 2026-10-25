"""Resumable A9-vs-A9 control using the unchanged production bridge."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import time
from contextlib import ExitStack
from pathlib import Path

import numpy as np

from environment import Bridge, rules_digest
from train import paired_state


class BudgetExpired(RuntimeError):
    pass


def run(args):
    live = args.live.resolve()
    assert (live / 'stop.flag').exists(), 'Save-stop live training first'
    with ExitStack() as stack:
        for name in ('supervisor.lock', 'run.lock'):
            handle = stack.enter_context((live / name).open('a+'))
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        checkpoint = live / 'latest.pt'
        before = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
        metadata = dict(opponent='a9-vs-a9', seed=args.seed, planned_pairs=args.pairs,
                        rules_sha256=rules_digest(), mc_sample_cap=64, time_limit_ms=1000,
                        clock='production', rng='RandomState(seed ^ 0x596170), shared within game',
                        productionChanged=False)
        saved = json.loads(args.output.read_text()) if args.output.exists() else {}
        if saved:
            assert all(saved.get(k) == v for k, v in metadata.items()), 'Control configuration changed'
        matches = saved.get('matches', [])
        chunks = saved.get('chunks', [])
        started = dt.datetime.now(dt.timezone.utc).isoformat()
        start_pairs = len(matches)
        status = 'running'
        assert len(matches) <= args.pairs
        for index, pair in enumerate(matches):
            assert len(pair) == 2
            assert [m['swap'] for m in pair] == [False, True]
            assert all(m['seed'] == args.seed + index for m in pair)
        wall_deadline = time.time() + args.minutes * 60
        mono_deadline = time.monotonic() + args.minutes * 60

        def check():
            if time.time() >= wall_deadline or time.monotonic() >= mono_deadline:
                raise BudgetExpired('Control chunk deadline')

        def save():
            games = [m for pair in matches for m in pair]
            record = dict(metadata, matches=matches, chunks=chunks, status=status,
                          pairs=len(matches), games=len(games),
                          complete=len(matches) == args.pairs,
                          wins=sum(m['returns'][0] > 0 for m in games),
                          draws=sum(m['returns'][0] == 0 for m in games),
                          losses=sum(m['returns'][0] < 0 for m in games),
                          updated_utc=dt.datetime.now(dt.timezone.utc).isoformat())
            args.output.parent.mkdir(parents=True, exist_ok=True)
            temporary = args.output.with_suffix('.tmp')
            temporary.write_text(json.dumps(record, indent=2) + '\n')
            temporary.replace(args.output)

        try:
            with Bridge() as bridge:
                for index in range(len(matches), args.pairs):
                    pair = []
                    seed = args.seed + index
                    for swap in (False, True):
                        state = paired_state(bridge, seed, swap)
                        rng = np.random.RandomState(seed ^ 0x596170)
                        actions = []
                        while not state.is_terminal():
                            check()
                            action = bridge.call('baseline', state=state.data, baseline='a9',
                                                 seed=int(rng.randint(2**31)))
                            check()
                            assert action in state.legal_actions()
                            state.apply_action(action)
                            actions.append(int(action))
                            assert len(actions) <= 31
                        pair.append(dict(seed=seed, swap=swap, model_seat=0,
                                         actions=actions, returns=state.returns().tolist(),
                                         scores=[p['score'] for p in state.data['players']]))
                    matches.append(pair)
                    save()
            status = 'complete'
        except BudgetExpired:
            status = 'chunk_deadline'
        except Exception as error:
            status = type(error).__name__ + ': ' + str(error)
            raise
        finally:
            chunks.append(dict(started_utc=started, ended_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
                               start_pairs=start_pairs, end_pairs=len(matches), status=status))
            save()
            assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == before
        print(json.dumps(dict(pairs=len(matches), complete=len(matches) == args.pairs,
                              live_checkpoint_sha256=before)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--seed', type=int, required=True)
    parser.add_argument('--pairs', type=int, default=50)
    parser.add_argument('--minutes', type=float, default=24)
    arguments = parser.parse_args()
    assert 0 < arguments.minutes <= 25 and 0 < arguments.pairs <= 50
    run(arguments)
