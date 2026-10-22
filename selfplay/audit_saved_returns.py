"""Replay saved evaluation actions and compare labels to the reducer winner."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path

from environment import Bridge
from train import paired_state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deadline', required=True)
    parser.add_argument('results', type=Path, nargs='+')
    args = parser.parse_args()
    deadline = dt.datetime.fromisoformat(args.deadline.replace('Z', '+00:00'))
    started = dt.datetime.now(dt.timezone.utc)
    assert started < deadline <= started + dt.timedelta(minutes=30)
    reports = []
    with Bridge() as bridge:
        for path in args.results:
            raw = path.read_bytes()
            if path.suffix == '.jsonl':
                # A running trainer can append a partial final line during this read.
                cutoff = raw.rfind(b'\n') + 1
                raw = raw[:cutoff]
                events = [json.loads(line) for line in raw.splitlines()]
                matches = [event['match'] for event in events if event['event'] == 'selfplay']
                saved = {}
            else:
                saved = json.loads(raw)
                matches = [match for pair in saved['matches'] for match in pair]
            mismatches, moves, games, score_disagreements = [], 0, 0, 0
            for match in matches:
                assert dt.datetime.now(dt.timezone.utc) < deadline
                state = paired_state(bridge, match['seed'], match['swap'])
                for action in match['actions']:
                    state.apply_action(action)
                    moves += 1
                assert state.is_terminal()
                assert [p['score'] for p in state.data['players']] == match['scores']
                correct = state.returns().tolist()
                if correct != match['returns']:
                    mismatches.append(dict(seed=match['seed'], swap=match['swap'],
                                           winner=state.data['winner'], saved=match['returns'], correct=correct))
                score_disagreements += (match['scores'][0] > match['scores'][1]) - (
                    match['scores'][0] < match['scores'][1]) != correct[0]
                games += 1
            reports.append(dict(input_name=path.parent.name, input_sha256=hashlib.sha256(raw).hexdigest(),
                                snapshot_bytes=len(raw), complete=saved.get('complete'), games=games, moves=moves,
                                unique_seed_seats=len({(m['seed'], m['swap']) for m in matches}),
                                model_sha256=saved.get('model_sha256'), seed=saved.get('seed'),
                                mismatches=mismatches, score_disagreements=score_disagreements))
    print(json.dumps(dict(started_utc=started.isoformat(),
                          ended_utc=dt.datetime.now(dt.timezone.utc).isoformat(), reports=reports), indent=2))


if __name__ == '__main__':
    main()
