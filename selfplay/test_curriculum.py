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
                             {'self': 4 * size, 'baseline': 2 * size, 'past-model': 2 * size})
            past = collections.Counter((index, seat) for kind, index, seat in plans if kind == 'past-model')
            self.assertEqual(past, {(index, seat): 1 for index in range(size) for seat in (0, 1)})
            self.assertEqual(collections.Counter(seat for kind, _, seat in plans if kind == 'baseline'),
                             {0: size, 1: size})

    def test_empty_population_and_resume_boundary(self):
        self.assertEqual(episode_plan(3, 0)[0], 'self')
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
                        self.assertEqual(sample['source'] in ('search', 'teacher-a9'), True)
                    for source, player in [('search', seat), ('teacher-a9', 1 - seat)]:
                        subset = [s for s in samples if s['source'] == source]
                        self.assertGreaterEqual(len(subset), 15)
                        self.assertTrue(all(s['z'] == match['returns'][player] for s in subset))


if __name__ == '__main__':
    unittest.main()
