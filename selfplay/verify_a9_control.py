"""Replay a complete production A9 control and independently count paired outcomes."""
import argparse
import hashlib
import json
import math
from pathlib import Path

from environment import Bridge, rules_digest
from train import paired_state


def verify(result, bridge):
    assert result['complete'] and result['pairs'] == result['planned_pairs'] == 50
    assert result['games'] == 100 and len(result['matches']) == 50
    assert result['opponent'] == 'a9-vs-a9' and result['clock'] == 'production'
    assert result['mc_sample_cap'] == 64 and result['time_limit_ms'] == 1000
    assert result['rules_sha256'] == rules_digest()
    pairs, moves, wins, draws, losses = [], 0, 0, 0, 0
    for index, matches in enumerate(result['matches']):
        assert len(matches) == 2
        utilities, margins = [], []
        for swap, match in zip((False, True), matches):
            assert match['seed'] == result['seed'] + index
            assert match['swap'] == swap and match['model_seat'] == 0
            state = paired_state(bridge, match['seed'], swap)
            assert len(match['actions']) <= 31
            for action in match['actions']:
                assert action in state.legal_actions()
                state.apply_action(action)
                moves += 1
            assert state.is_terminal()
            returns = state.returns().tolist()
            scores = [player['score'] for player in state.data['players']]
            assert returns == match['returns'] and scores == match['scores']
            winner = state.data['winner']
            utility = {'p1': 1, 'p2': -1, 'draw': 0}[winner]
            assert returns == [utility, -utility]
            wins += utility > 0
            draws += utility == 0
            losses += utility < 0
            utilities.append(utility)
            margins.append(scores[0] - scores[1])
        pairs.append(dict(seed=result['seed'] + index,
                          mean_utility=sum(utilities) / 2,
                          mean_score_margin=sum(margins) / 2))
    assert [wins, draws, losses] == [result[k] for k in ('wins', 'draws', 'losses')]
    mean = sum(pair['mean_utility'] for pair in pairs) / 50
    radius = 2 * math.sqrt(math.log(40) / 100)
    return dict(complete=True, seed=result['seed'], pairs=50, games=100,
                wins=wins, draws=draws, losses=losses, mean_utility=mean,
                paired_hoeffding95=[max(-1, mean - radius), min(1, mean + radius)],
                mean_score_margin=sum(p['mean_score_margin'] for p in pairs) / 50,
                pair_records=pairs, replayed_moves=moves, new_inference=0,
                production_changed=False,
                scope='Actual reducer replay and separate Python arithmetic; not an independent hand evaluator. '
                      'Production deadline variability is not removed or corrected by this control.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--result', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    raw = args.result.read_bytes()
    result = json.loads(raw)
    with Bridge() as bridge:
        summary = verify(result, bridge)
    summary['input_sha256'] = hashlib.sha256(raw).hexdigest()
    assert args.result.read_bytes() == raw
    args.output.write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({k: v for k, v in summary.items() if k != 'pair_records'}))
