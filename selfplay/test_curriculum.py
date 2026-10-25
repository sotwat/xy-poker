import collections
import unittest
from unittest.mock import patch

import numpy as np
import torch

from environment import ACTIONS, Bridge
from train import PolicyValue, episode_plan, play


class CurriculumTests(unittest.TestCase):
    def test_all_populations_cover_each_opponent_and_both_seats(self):
        for size in range(1, 5):
            plans = [episode_plan(n, size) for n in range(8 * size)]
            self.assertEqual(collections.Counter(p[0] for p in plans),
                             {'self': 2 * size, 'teacher-selfplay': 2 * size,
                              'baseline': 2 * size, 'past-model': 2 * size})
            past = collections.Counter((index, seat) for kind, index, seat in plans if kind == 'past-model')
            self.assertEqual(past, {(index, seat): 1 for index in range(size) for seat in (0, 1)})
            self.assertEqual(collections.Counter(seat for kind, _, seat in plans if kind == 'baseline'),
                             {0: size, 1: size})

    def test_empty_population_and_resume_boundary(self):
        self.assertEqual(episode_plan(3, 0)[0], 'self')
        self.assertEqual([episode_plan(n, 4)[0] for n in range(8)],
                         ['self', 'self', 'baseline', 'past-model',
                          'teacher-selfplay', 'teacher-selfplay', 'baseline', 'past-model'])
        for offset in (1, 3, 7, 6185):
            full = [episode_plan(n, 4) for n in range(offset + 64)]
            self.assertEqual(full[offset:], [episode_plan(n, 4) for n in range(offset, offset + 64)])
        with self.assertRaises(ValueError):
            episode_plan(-1, 4)

    def test_teacher_targets_are_legal_observed_and_labelled_for_both_seats(self):
        torch.set_num_threads(2)
        model = PolicyValue(16).eval()
        def deterministic_search(state, *_args, **_kwargs):
            pi = np.zeros(ACTIONS, dtype=np.float32)
            pi[state.legal_actions()[0]] = 1
            return pi
        with Bridge() as bridge:
            original = bridge.call
            def call(op, **kwargs):
                if op == 'baseline':
                    from environment import legal_actions
                    return legal_actions(kwargs['state'])[0]
                return original(op, **kwargs)
            with patch.object(bridge, 'call', side_effect=call), patch('train.search', deterministic_search):
                for seat in (0, 1):
                    samples, match = play(bridge, model, 100523101, 4,
                                          opponent='baseline', model_seat=seat, training=True)
                    self.assertEqual(len(samples), 31)
                    self.assertEqual(len(match['actions']), 31)
                    for sample, action in zip(samples, match['actions']):
                        self.assertEqual(sample['pi'][action], 1)
                        self.assertTrue(sample['mask'][action])
                        self.assertEqual(sample['source'] in ('teacher-a9-advice', 'teacher-a9'), True)
                    for source, player in [('teacher-a9-advice', seat), ('teacher-a9', 1 - seat)]:
                        subset = [s for s in samples if s['source'] == source]
                        self.assertGreaterEqual(len(subset), 15)
                        self.assertTrue(all(s['z'] == match['returns'][player] for s in subset))

    def test_advice_changes_target_without_forcing_action_or_duplicating_value(self):
        model = PolicyValue(16).eval()
        def last_action_search(state, *_args, **_kwargs):
            pi = np.zeros(ACTIONS, dtype=np.float32)
            pi[state.legal_actions()[-1]] = 1
            return pi
        with Bridge() as bridge:
            original = bridge.call
            def call(op, **kwargs):
                if op == 'baseline':
                    from environment import legal_actions
                    return legal_actions(kwargs['state'])[0]
                return original(op, **kwargs)
            with patch.object(bridge, 'call', side_effect=call), patch('train.search', last_action_search):
                for seat in (0, 1):
                    samples, match = play(bridge, model, 100523211, 4,
                                          opponent='baseline', model_seat=seat, training=True)
                    self.assertEqual(len(samples), 31)
                    advice = [(s, a) for s, a in zip(samples, match['actions'])
                              if s['source'] == 'teacher-a9-advice']
                    self.assertGreaterEqual(len(advice), 15)
                    self.assertTrue(any(s['pi'][a] == 0 for s, a in advice))
                    for s, _ in advice:
                        self.assertEqual(s['z'], match['returns'][seat])
                        self.assertEqual(int(s['pi'].argmax()), int(torch.where(s['mask'])[0][0]))

    def test_expert_pair_uses_both_teachers_and_actual_seat_returns(self):
        model = PolicyValue(16).eval()
        with Bridge() as bridge:
            original = bridge.call
            def call(op, **kwargs):
                if op == 'baseline':
                    from environment import legal_actions
                    return legal_actions(kwargs['state'])[0]
                return original(op, **kwargs)
            with patch.object(bridge, 'call', side_effect=call), patch('train.search') as search_mock:
                samples, match = play(bridge, model, 100524301, 128,
                                      opponent='teacher-selfplay', training=True)
                search_mock.assert_not_called()
                self.assertEqual(len(samples), len(match['actions']))
                self.assertTrue(all(s['source'] == 'teacher-a9-selfplay' for s in samples))
                for s, action in zip(samples, match['actions']):
                    self.assertEqual(s['pi'][action], 1)
                    self.assertTrue(s['mask'][action])
                from train import paired_state
                state = paired_state(bridge, match['seed'])
                for s, action in zip(samples, match['actions']):
                    self.assertEqual(s['z'], match['returns'][state.current_player()])
                    state.apply_action(action)
                with self.assertRaisesRegex(ValueError, 'not a learned-policy evaluation'):
                    play(bridge, model, 100524301, 128, opponent='teacher-selfplay')


if __name__ == '__main__':
    unittest.main()
