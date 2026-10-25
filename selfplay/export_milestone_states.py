"""Replay a complete milestone into a temporary input for component accounting."""
import argparse
import hashlib
import json
from pathlib import Path

from environment import Bridge
from train import paired_state


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('result', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    raw = args.result.read_bytes()
    result = json.loads(raw)
    assert result['complete'] and result['games'] == 100 and result['pairs'] == 50
    rows = []
    with Bridge() as bridge:
        for pair_index, pair in enumerate(result['matches']):
            assert len(pair) == 2 and [m['swap'] for m in pair] == [False, True]
            for match in pair:
                assert match['seed'] == result['seed'] + pair_index
                state = paired_state(bridge, match['seed'], match['swap'])
                for action in match['actions']:
                    state.apply_action(action)
                assert state.is_terminal()
                assert state.returns().tolist() == match['returns']
                assert [p['score'] for p in state.data['players']] == match['scores']
                rows.append(dict(pair=pair_index, seed=match['seed'], swap=match['swap'],
                                 state=state.data))
    args.output.write_text(json.dumps(dict(input_sha256=hashlib.sha256(raw).hexdigest(),
                                          model_sha256=result['model_sha256'], seed=result['seed'],
                                          simulations=result['simulations'], rows=rows)))
