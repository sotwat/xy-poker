import copy
import fcntl
import json
from pathlib import Path
import signal
import subprocess
import tempfile
import unittest

import numpy as np
import torch

from environment import (ACTIONS, CARDS, FEATURES, ROOT, Bridge, XYState,
                         features, legal_actions, observation, resample)
from train import (PolicyValue, evaluation_summary, fingerprint, learn,
                   load_checkpoint, play, search)


class SelfPlayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)
        cls.bridge = Bridge()

    @classmethod
    def tearDownClass(cls):
        cls.bridge.close()

    def test_hidden_world_does_not_change_inputs_or_search(self):
        data = self.bridge.call('new', seed=123)
        state = XYState(self.bridge, data)
        state.apply_action(520)
        hidden = next(a for a in state.legal_actions() if a % 2)
        state.apply_action(hidden)
        data = state.data
        player = state.current_player()
        altered = resample(data, player, np.random.RandomState(45))
        self.assertNotEqual(data['deck'], altered['deck'])
        self.assertEqual(observation(data, player), observation(altered, player))
        np.testing.assert_array_equal(features(data, player), features(altered, player))
        self.assertEqual(len(features(data, player)), FEATURES)
        model = PolicyValue(16).eval()
        a = search(XYState(self.bridge, data), model, 100, np.random.RandomState(9))
        b = search(XYState(self.bridge, altered), model, 100, np.random.RandomState(9))
        np.testing.assert_array_equal(a, b)

    def test_resampling_conserves_cards_and_own_knowledge(self):
        state = XYState(self.bridge, self.bridge.call('new', seed=22))
        state.apply_action(520)
        for _ in range(8):
            state.apply_action(next((a for a in state.legal_actions() if a % 2), state.legal_actions()[0]))
        for player in (0, 1):
            sampled = resample(state.data, player, np.random.RandomState(81))
            self.assertEqual(sampled['players'][player], state.data['players'][player])
            all_cards = sampled['deck'] + [c for p in sampled['players']
                                         for c in p['hand'] + [c for row in p['board'] for c in row if c]]
            self.assertEqual(sorted(c['id'] for c in all_cards), sorted(c['id'] for c in CARDS))
            self.assertEqual(len(all_cards), 52)
            # Reducer validation also accepts the reconstructed full world.
            actor_state = XYState(self.bridge, sampled)
            actor_state.apply_action(actor_state.legal_actions()[0])

    def test_all_legal_actions_agree_with_reducer_through_complete_game(self):
        state = XYState(self.bridge, self.bridge.call('new', seed=343))
        rng = np.random.RandomState(17)
        count = 0
        while not state.is_terminal():
            actions = state.legal_actions()
            for action in actions:
                child = state.clone()
                child.apply_action(action)
                self.assertNotEqual(child.data, state.data)
            with self.assertRaises(ValueError):
                self.bridge.call('step', state=state.data, action=522, seed=0)
            state.apply_action(int(rng.choice(actions)))
            count += 1
        self.assertEqual(count, 31)
        self.assertEqual(sum(state.returns()), 0)
        self.assertEqual(state.legal_actions(), [])
        self.assertTrue(all(c is not None for p in state.data['players'] for row in p['board'] for c in row))

    def test_hide_constraints(self):
        state = XYState(self.bridge, self.bridge.call('new', seed=1))
        state.apply_action(520)
        data = copy.deepcopy(state.data)
        p = data['players'][data['currentPlayerIndex']]
        p['hiddenCardsCount'] = 3
        self.assertTrue(all(a % 2 == 0 for a in legal_actions(data)))
        p['hiddenCardsCount'] = 2
        p['board'][0][0] = dict(CARDS[0], isHidden=True)
        p['board'][1][0] = dict(CARDS[1], isHidden=True)
        self.assertFalse(any(a % 10 == 1 for a in legal_actions(data)))
        p['board'][2][0] = dict(CARDS[2])
        self.assertFalse(any(a % 10 in (0, 1) for a in legal_actions(data)))

    def test_policy_is_masked_and_training_updates_real_game_samples(self):
        torch.manual_seed(21)
        model = PolicyValue(16).eval()
        samples, match = play(self.bridge, model, 21, 8, training=True)
        self.assertEqual(len(match['actions']), 31)
        self.assertEqual(len(samples), 31)
        self.assertEqual(len(samples[0]['pi']), ACTIONS)
        for sample in samples:
            self.assertAlmostEqual(float(sample['pi'].sum()), 1, places=5)
            self.assertTrue(torch.equal(sample['pi'][~sample['mask']],
                                        torch.zeros_like(sample['pi'][~sample['mask']])))
            self.assertIn(sample['z'], (-1, 0, 1))
        before = fingerprint(model)
        optimizer = torch.optim.AdamW(model.parameters(), lr=.01)
        losses = learn(model, optimizer, samples, np.random.RandomState(1), 30, 64)
        self.assertNotEqual(before, fingerprint(model))
        self.assertTrue(all(np.isfinite(v) for v in losses.values()))
        self.assertLess(losses['value_loss'], 1)

    def test_checkpoint_resume_matches_uninterrupted_training(self):
        with tempfile.TemporaryDirectory() as temp:
            a, b = Path(temp) / 'a', Path(temp) / 'b'
            common = [str(ROOT / '.venv-selfplay/bin/python'), 'selfplay/train.py', 'train',
                      '--games', '1', '--simulations', '4', '--steps', '2', '--width', '16',
                      '--eval-pairs', '0', '--minutes', '2']
            for directory, iterations, resume in ((a, 2, False), (b, 1, False), (b, 1, True)):
                result = subprocess.run(common + ['--output', str(directory), '--iterations', str(iterations)]
                                        + (['--resume'] if resume else []), cwd=ROOT,
                                        text=True, capture_output=True, timeout=90)
                self.assertEqual(result.returncode, 0, result.stderr)
            first, resumed = load_checkpoint(a / 'latest.pt'), load_checkpoint(b / 'latest.pt')
            self.assertEqual(first['model_sha256'], resumed['model_sha256'])
            self.assertEqual(first['total_games'], resumed['total_games'])
            self.assertEqual(first['rng'], resumed['rng'])
            self.assertTrue(torch.equal(first['torch_rng'], resumed['torch_rng']))
            for sample_a, sample_b in zip(first['replay'], resumed['replay']):
                self.assertTrue(torch.equal(sample_a['x'], sample_b['x']))
                self.assertEqual(sample_a['z'], sample_b['z'])
            events = [json.loads(line) for line in (b / 'events.jsonl').read_text().splitlines()]
            self.assertEqual(sum(e['event'] == 'learn' for e in events), 2)

    def test_deadline_saves_resumable_checkpoint(self):
        with tempfile.TemporaryDirectory() as temp:
            command = [str(ROOT / '.venv-selfplay/bin/python'), 'selfplay/train.py', 'train',
                       '--output', temp, '--games', '1', '--simulations', '4', '--steps', '1',
                       '--eval-pairs', '0', '--minutes', '.000001']
            result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr)
            saved = load_checkpoint(Path(temp) / 'latest.pt')
            self.assertEqual(saved['total_games'], 0)
            self.assertIn('"event": "stopped"', result.stdout)

    def test_interrupted_learning_rolls_back_update_and_preserves_completed_game(self):
        with tempfile.TemporaryDirectory() as temp:
            command = [str(ROOT / '.venv-selfplay/bin/python'), 'selfplay/train.py', 'train',
                       '--output', temp, '--games', '1', '--simulations', '4', '--width', '16',
                       '--steps', '100000', '--eval-pairs', '0', '--minutes', '.03']
            result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr)
            saved = load_checkpoint(Path(temp) / 'latest.pt')
            self.assertEqual(saved['total_games'], 1)
            self.assertEqual(saved['games_done'], 1)
            self.assertEqual(saved['iteration'], 0)
            torch.manual_seed(20261021)
            initial = PolicyValue(16)
            self.assertEqual(saved['model_sha256'], fingerprint(initial))
            self.assertEqual(len(saved['replay']), 31)

    def test_second_writer_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with (Path(temp) / 'run.lock').open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                result = subprocess.run([str(ROOT / '.venv-selfplay/bin/python'),
                                         'selfplay/train.py', 'train', '--output', temp], cwd=ROOT,
                                        text=True, capture_output=True, timeout=60)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Another training process', result.stderr)
                self.assertFalse((Path(temp) / 'latest.pt').exists())

    def test_sigint_saves_without_corrupting_checkpoint(self):
        with tempfile.TemporaryDirectory() as temp:
            process = subprocess.Popen([str(ROOT / '.venv-selfplay/bin/python'),
                                        'selfplay/train.py', 'train', '--output', temp], cwd=ROOT,
                                       text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                first_line = process.stdout.readline()
                self.assertEqual(json.loads(first_line)['event'], 'start')
                process.send_signal(signal.SIGINT)
                stdout, stderr = process.communicate(timeout=30)
                self.assertEqual(process.returncode, 0, stderr)
                self.assertIn('"event": "stopped"', stdout)
                saved = load_checkpoint(Path(temp) / 'latest.pt')
                self.assertEqual(saved['iteration'], 0)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate()

    def test_confidence_uses_pairs_and_marks_incomplete_evaluation(self):
        summary = evaluation_summary([[{'returns': [1, -1]}, {'returns': [-1, 1]}]], 2, 'a9')
        self.assertFalse(summary['complete'])
        self.assertEqual(summary['pairs'], 1)
        self.assertEqual(summary['games'], 2)
        self.assertEqual(summary['mean_utility'], 0)
        self.assertEqual(summary['hoeffding95'], [-1, 1])
        empty = evaluation_summary([], 2, 'a9')
        self.assertIsNone(empty['mean_utility'])
        self.assertIsNone(empty['hoeffding95'])


if __name__ == '__main__':
    unittest.main()
