"""Audit stored teacher rows against recorded games, without new teacher calls."""
import collections
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
import torch

from environment import ACTIONS, CARD_INDEX, features, observation, resample, Bridge
from train import load_checkpoint, paired_state


def decoded_mask(x):
    """Recover legal moves from the serialized network input, not state helpers."""
    board = x[:1620].reshape(30, 54)
    assert torch.all((board == 0) | (board == 1))
    assert torch.all(board.sum(1) == 1)
    hidden = x[1620:1650].reshape(2, 3, 5)
    hand = x[1650:1702]
    assert torch.all((hidden == 0) | (hidden == 1))
    assert torch.all((hand == 0) | (hand == 1))
    mask = torch.zeros(ACTIONS, dtype=torch.bool)
    if float(x[-2]) == 1:
        mask[520:522] = True
        return mask
    for card in hand.nonzero().flatten().tolist():
        for col in range(5):
            if board[10 + col, 0] == 1:
                mask[card * 10 + col * 2] = True
                if round(float(x[1709]) * 3) < 3 and hidden[0, :, col].sum() < 2:
                    mask[card * 10 + col * 2 + 1] = True
    return mask


def run(directory):
    torch.set_num_threads(1)
    checkpoint = directory / 'latest.pt'
    bytehash = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    saved = load_checkpoint(checkpoint)
    replay = saved['replay']
    counts = collections.Counter()
    for row in replay:
        if not row.get('source', '').startswith('teacher-a9'):
            continue
        assert row['x'].shape == (1716,)
        assert torch.equal(decoded_mask(row['x']), row['mask'])
        assert torch.isfinite(row['x']).all()
        assert torch.isfinite(row['pi']).all()
        target = int(row['pi'].argmax())
        assert float(row['pi'][target]) == 1 and float(row['pi'].sum()) == 1
        assert row['mask'][target] and row['z'] in (-1, 0, 1)
        counts[row['source']] += 1

    events = [json.loads(line) for line in (directory / 'events.jsonl').read_text().splitlines()]
    events = [e for e in events if e.get('event') == 'selfplay'
              and e['total_games'] <= saved['total_games']]
    assert events[-1]['total_games'] == saved['total_games']
    # Recover exact contiguous replay offsets from the append/truncate event counts.
    cursor, available = len(replay), []
    for event in reversed(events):
        start = cursor - event['samples']
        if start < 0:
            break
        available.append((event, replay[start:cursor]))
        cursor = start
    selected, quotas = [], collections.Counter()
    for event, rows in available:
        key = (event['opponent'], event['match']['model_seat'])
        if key[0] in ('teacher-selfplay', 'baseline') and quotas[key] < (8 if key[0] == 'teacher-selfplay' else 4):
            selected.append((event, rows))
            quotas[key] += 1
    assert len(selected) == 16 and sorted(quotas.values()) == [4, 4, 8]
    results, checks = [], collections.Counter()
    rng = np.random.RandomState(100525076)
    with Bridge() as bridge:
        for event, rows in sorted(selected, key=lambda pair: pair[0]['total_games']):
            match = event['match']
            state = paired_state(bridge, match['seed'], match['swap'])
            assert len(rows) == len(match['actions'])
            actors = collections.Counter()
            for row, action in zip(rows, match['actions']):
                actor = state.current_player()
                actors[actor] += 1
                assert observation(state.data, actor)['actor'] == 0
                assert np.array_equal(row['x'].numpy(), features(state.data, actor))
                expected_mask = torch.zeros(ACTIONS, dtype=torch.bool)
                expected_mask[state.legal_actions()] = True
                assert torch.equal(row['mask'], expected_mask)
                assert row['z'] == match['returns'][actor]
                expected_source = ('teacher-a9-selfplay' if event['opponent'] == 'teacher-selfplay'
                                   else 'teacher-a9-advice' if actor == match['model_seat']
                                   else 'teacher-a9')
                assert row['source'] == expected_source
                target = int(row['pi'].argmax())
                if expected_source != 'teacher-a9-advice':
                    assert target == action
                    checks['recorded_teacher_action_matches'] += 1
                else:
                    checks['advice_differs_from_played_action'] += int(target != action)
                    checks['advice_legal_only_no_original_call_log'] += 1
                if target < 520:
                    card_id = next(c for c, i in CARD_INDEX.items() if i == target // 10)
                    assert any(c['id'] == card_id for c in state.data['players'][actor]['hand'])
                    clone = state.clone()
                    clone.apply_action(target)
                    placed = clone.data['players'][actor]['board']
                    col = target % 10 // 2
                    assert any(placed[r][col] and placed[r][col]['id'] == card_id
                               and placed[r][col]['isHidden'] == bool(target % 2) for r in range(3))
                    checks['teacher_card_column_hidden_roundtrip'] += 1
                mirror = copy.deepcopy(state.data)
                mirror['players'].reverse()
                mirror['players'][0]['id'], mirror['players'][1]['id'] = 'p1', 'p2'
                mirror['currentPlayerIndex'] = 1 - actor
                assert np.array_equal(row['x'].numpy(), features(mirror, 1 - actor))
                assert np.array_equal(row['x'].numpy(), features(resample(state.data, actor, rng), actor))
                checks['state_feature_mask_actor_return_mirror_hidden_invariance'] += 1
                state.apply_action(action)
            assert state.is_terminal() and np.array_equal(state.returns(), match['returns'])
            assert [p['score'] for p in state.data['players']] == match['scores']
            results.append(dict(total_games=event['total_games'], seed=match['seed'],
                                opponent=event['opponent'], model_seat=match['model_seat'],
                                rows=len(rows), actors=dict(actors)))
    assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == bytehash
    return dict(checkpoint_sha256=bytehash, total_games=saved['total_games'],
                model_sha256=saved['model_sha256'], replay_rows=len(replay),
                teacher_rows=dict(counts), checks=dict(checks), matches=results,
                new_teacher_calls=0, training_updates=0,
                limits='Structural audit of correlated stored data, not strength or independent scoring. '
                       'Advice calls have no stored original response log: label legality/alignment only; '
                       'current teacher recomputation would not prove historical response identity.')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(run(args.directory), indent=2) + '\n')
