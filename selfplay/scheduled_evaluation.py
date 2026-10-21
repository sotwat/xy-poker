"""Resumable A9 evaluation at self-play milestones."""
import argparse
import json
import os
from pathlib import Path
import signal
import time

import torch

from environment import Bridge
from train import PolicyValue, evaluate, evaluation_summary, fingerprint, load_checkpoint


def write_json(path, data):
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, indent=2, allow_nan=False) + '\n')
    os.replace(temporary, path)


def next_action(directory, every, saved):
    total = saved['total_games']
    milestone = max(every, total // every * every)
    result = directory / 'a9-milestones' / f'games-{milestone:08d}' / 'result.json'
    complete = result.exists() and json.loads(result.read_text()).get('complete', False)
    if total >= milestone and not complete:
        return 'evaluate', milestone
    target = milestone + every if total >= milestone else milestone
    # A resumed partial generation still counts as one remaining update.
    iterations = max(1, (target - total + saved['games_done'] + saved['config']['games'] - 1)
                     // saved['config']['games'])
    return 'train', iterations


def run(directory, milestone, pairs, simulations, minutes):
    torch.set_num_threads(2)
    folder = directory / 'a9-milestones' / f'games-{milestone:08d}'
    folder.mkdir(parents=True, exist_ok=True)
    snapshot = folder / 'model.pt'
    if not snapshot.exists():
        saved = load_checkpoint(directory / 'latest.pt')
        payload = {k: saved[k] for k in ('schema', 'features', 'actions', 'rules_sha256',
                                        'config', 'model', 'model_sha256', 'iteration', 'total_games')}
        temporary = snapshot.with_suffix('.pt.tmp')
        torch.save(payload, temporary)
        os.replace(temporary, snapshot)
    saved = load_checkpoint(snapshot)
    model = PolicyValue(saved['config']['width'])
    model.load_state_dict(saved['model'])
    model.eval()
    result_path = folder / 'result.json'
    prior = json.loads(result_path.read_text()) if result_path.exists() else None
    model_hash = fingerprint(model)
    seed = 2**31 + 400_000_000 + milestone * 100
    if seed + pairs >= 2**32:
        raise ValueError('Evaluation seed range exhausted')
    if prior and (prior['model_sha256'] != model_hash or prior['seed'] != seed
                  or prior['planned_pairs'] != pairs or prior['simulations'] != simulations):
        raise ValueError('Scheduled evaluation settings or model changed')
    matches = prior['matches'] if prior else []
    if len(matches) >= pairs:
        return
    stopping = False
    deadline = time.monotonic() + minutes * 60
    wall_deadline = time.time() + minutes * 60

    def stop(_sig, _frame):
        nonlocal stopping
        stopping = True

    def check_stop():
        from train import Stopped
        if stopping or (directory / 'stop.flag').exists() or time.monotonic() >= deadline or time.time() >= wall_deadline:
            raise Stopped()

    def progress(partial):
        summary = evaluation_summary(matches + partial['matches'], pairs, 'a9')
        summary.update(model_sha256=model_hash, seed=seed, simulations=simulations,
                       milestone=milestone, training_games=saved['total_games'],
                       iteration=saved['iteration'], checkpoint=str(snapshot),
                       production_changed=False, updated_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
        write_json(result_path, summary)

    handlers = {sig: signal.signal(sig, stop) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        progress({'matches': []})
        with Bridge() as bridge:
            result = evaluate(bridge, model, seed + len(matches), pairs - len(matches),
                              simulations, 'baseline', check_stop, baseline='a9', progress=progress)
            progress(result)
    finally:
        for sig, handler in handlers.items():
            signal.signal(sig, handler)
    summary = json.loads(result_path.read_text())
    print(json.dumps({k: v for k, v in summary.items() if k != 'matches'}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--milestone', type=int, required=True)
    parser.add_argument('--pairs', type=int, default=50)
    parser.add_argument('--simulations', type=int, default=128)
    parser.add_argument('--minutes', type=float, default=30)
    args = parser.parse_args()
    if min(args.milestone, args.pairs, args.simulations, args.minutes) <= 0:
        parser.error('All numeric settings must be positive')
    run(Path(args.output).resolve(), args.milestone, args.pairs, args.simulations, args.minutes)
