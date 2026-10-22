"""Replay saved actions through the running worktree's reducer, without search."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--active', required=True, type=Path)
parser.add_argument('--result', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--deadline', required=True)
args = parser.parse_args()
deadline = dt.datetime.fromisoformat(args.deadline)
assert dt.datetime.now(dt.timezone.utc) < deadline
sys.path.insert(0, str(args.active / 'selfplay'))
from environment import Bridge
from train import paired_state

raw = args.result.read_bytes()
saved = json.loads(raw)
assert saved['complete'] and saved['games'] == 100 and saved['pairs'] == 50
records = []
with Bridge() as bridge:
    for index, pair in enumerate(saved['matches']):
        assert len(pair) == 2 and [m['swap'] for m in pair] == [False, True]
        for match in pair:
            assert dt.datetime.now(dt.timezone.utc) < deadline
            state = paired_state(bridge, match['seed'], match['swap'])
            for action in match['actions']:
                state.apply_action(action)
            assert state.is_terminal()
            assert state.returns().tolist() == match['returns']
            assert [p['score'] for p in state.data['players']] == match['scores']
            records.append(dict(pair=index, seed=match['seed'], swap=match['swap'], state=state.data))
args.output.write_text(json.dumps(dict(input_sha256=hashlib.sha256(raw).hexdigest(),
                                     model_sha256=saved['model_sha256'], seed=saved['seed'],
                                     simulations=saved['simulations'], records=records)))
