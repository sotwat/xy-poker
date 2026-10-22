import copy
import unittest

import numpy as np

from environment import Bridge, CARD_INDEX, XYState


class TerminalReturnsTests(unittest.TestCase):
    def test_royal_flush_uses_reducer_winner_with_unchanged_scores(self):
        with Bridge() as bridge:
            for winner_seat in (0, 1):
                with self.subTest(winner_seat=winner_seat):
                    state = XYState(bridge, bridge.call('new', seed=100522101))
                    state.apply_action(520)
                    for _ in range(29):
                        state.apply_action(state.legal_actions()[0])
                    data = copy.deepcopy(state.data)
                    actor = data['currentPlayerIndex']
                    slots = [(data['deck'], i) for i in range(len(data['deck']))]
                    for player in data['players']:
                        slots.extend((player['hand'], i) for i in range(len(player['hand'])))
                        slots.extend((row, i) for row in player['board']
                                     for i, card in enumerate(row) if card is not None)
                    self.assertEqual(len(slots), 52)
                    # Permute card identities, preserving the legal 29-move layout.
                    for seat in (0, 1):
                        bottom = data['players'][seat]['board'][2]
                        for col in range(5):
                            target, index = (bottom, col) if bottom[col] is not None else (
                                data['players'][actor]['hand'], 0)
                            desired = f'hearts-{10 + col}' if seat == winner_seat else f'spades-{2 + col}'
                            other, other_index = next((row, i) for row, i in slots if row[i]['id'] == desired)
                            target[index], other[other_index] = other[other_index], target[index]
                    bridge.call('validate', state=data)
                    state = XYState(bridge, data)
                    col = data['players'][actor]['board'][2].index(None)
                    action = CARD_INDEX[data['players'][actor]['hand'][0]['id']] * 10 + col * 2
                    state.apply_action(action)
                    self.assertTrue(state.is_terminal())
                    self.assertEqual(state.data['winner'], f'p{winner_seat + 1}')
                    self.assertEqual([p['score'] for p in state.data['players']], [0, 0])
                    expected = [1, -1] if winner_seat == 0 else [-1, 1]
                    np.testing.assert_array_equal(state.returns(), expected)

    def test_terminal_labels_are_explicit_and_validated(self):
        for winner, expected in [('p1', [1, -1]), ('p2', [-1, 1]), ('draw', [0, 0])]:
            data = dict(phase='ended', winner=winner, players=[dict(score=7), dict(score=3)])
            np.testing.assert_array_equal(XYState(None, data).returns(), expected)
        for winner in (None, 'unknown'):
            with self.assertRaises(ValueError):
                XYState(None, dict(phase='ended', winner=winner)).returns()
        with self.assertRaises(ValueError):
            XYState(None, dict(phase='playing', winner=None)).returns()
