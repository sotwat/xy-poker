import copy
import unittest

from compare_milestones import compare


class MatchedComparisonTests(unittest.TestCase):
    def result(self, utility):
        return dict(complete=True, pairs=50, games=100, planned_pairs=50,
                    seed=100, simulations=128, rules_sha256='same', opponent='a9',
                    model_sha256='model', training_games=8000,
                    wins=100 if utility == 1 else 0, draws=0, losses=100 if utility == -1 else 0,
                    matches=[[dict(seed=100 + i, swap=swap, model_seat=0,
                                   returns=[utility, -utility], scores=[2 + utility, 2 - utility])
                              for swap in (False, True)] for i in range(50)])

    def test_pair_deltas_and_nonzero_uncertainty_on_observed_equality(self):
        before = self.result(-1)
        equal = compare(before, copy.deepcopy(before))
        self.assertEqual(equal['mean_utility_delta'], 0)
        self.assertLess(equal['paired_hoeffding95'][0], 0)
        self.assertGreater(equal['paired_hoeffding95'][1], 0)
        improved = compare(before, self.result(1))
        self.assertEqual(improved['mean_utility_delta'], 2)
        self.assertEqual(improved['mean_score_margin_delta'], 4)

    def test_rejects_incomplete_settings_and_seat_mismatch(self):
        before = self.result(-1)
        for key, value in [('complete', False), ('simulations', 256), ('seed', 101)]:
            after = copy.deepcopy(before)
            after[key] = value
            with self.assertRaises(ValueError):
                compare(before, after)
        after = copy.deepcopy(before)
        after['matches'][0][1]['swap'] = False
        with self.assertRaises(ValueError):
            compare(before, after)
