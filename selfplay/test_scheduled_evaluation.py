import contextlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from scheduled_evaluation import next_action, run, write_json
from train import PolicyValue, atomic_save, fingerprint
from environment import ACTIONS, FEATURES, rules_digest
from train import SCHEMA


class ScheduledEvaluationTests(unittest.TestCase):
    def test_milestones_and_partial_generation(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            saved = dict(total_games=1998, games_done=2, config={'games': 4})
            self.assertEqual(next_action(directory, 2000, saved), ('train', 1))
            saved.update(total_games=2000, games_done=0)
            self.assertEqual(next_action(directory, 2000, saved), ('evaluate', 2000))
            target = directory / 'a9-milestones/games-00002000/result.json'
            target.parent.mkdir(parents=True)
            write_json(target, {'complete': False})
            self.assertEqual(next_action(directory, 2000, saved), ('evaluate', 2000))
            write_json(target, {'complete': True})
            self.assertEqual(next_action(directory, 2000, saved), ('train', 500))
            saved['total_games'] = 8000
            self.assertEqual(next_action(directory, 2000, saved), ('evaluate', 8000))

    def test_interrupted_evaluation_resumes_same_snapshot_and_unused_deals(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            model = PolicyValue(16).eval()
            payload = dict(schema=SCHEMA, features=FEATURES, actions=ACTIONS,
                           rules_sha256=rules_digest(), config={'width': 16},
                           model=model.state_dict(), model_sha256=fingerprint(model),
                           iteration=500, total_games=2000)
            atomic_save(directory / 'latest.pt', payload)
            calls = []

            def fake_evaluate(bridge, actor, seed, pairs, sims, opponent, check_stop,
                              baseline, progress):
                calls.append((seed, pairs, fingerprint(actor), baseline, sims))
                check_stop()
                pair = [dict(seed=seed, swap=False, returns=[1, -1]),
                        dict(seed=seed, swap=True, returns=[-1, 1])]
                result = {'matches': [pair]}
                progress(result)
                return result

            with patch('scheduled_evaluation.Bridge', return_value=contextlib.nullcontext()), \
                    patch('scheduled_evaluation.evaluate', side_effect=fake_evaluate):
                run(directory, 2000, 2, 128, 1)
                target = directory / 'a9-milestones/games-00002000/result.json'
                self.assertFalse(json.loads(target.read_text())['complete'])
                # A changed latest.pt must not alter the evaluation's frozen model.
                changed = PolicyValue(16).eval()
                payload.update(model=changed.state_dict(), model_sha256=fingerprint(changed),
                               total_games=2010)
                atomic_save(directory / 'latest.pt', payload)
                run(directory, 2000, 2, 128, 1)
                result = json.loads(target.read_text())
                self.assertTrue(result['complete'])
                self.assertEqual((result['pairs'], result['games'], result['wins'], result['losses']),
                                 (2, 4, 2, 2))
                self.assertEqual(calls[1][0], calls[0][0] + 1)
                self.assertEqual(calls[1][1], 1)
                self.assertEqual(calls[1][2], calls[0][2])
                self.assertEqual(result['training_games'], 2000)
                self.assertEqual(len({m[0]['seed'] for m in result['matches']}), 2)
                run(directory, 2000, 2, 128, 1)
                self.assertEqual(len(calls), 2)
                with self.assertRaisesRegex(ValueError, 'settings'):
                    run(directory, 2000, 3, 128, 1)

    def test_stop_flag_keeps_evaluation_incomplete(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            model = PolicyValue(16).eval()
            atomic_save(directory / 'latest.pt', dict(schema=SCHEMA, features=FEATURES,
                        actions=ACTIONS, rules_sha256=rules_digest(), config={'width': 16},
                        model=model.state_dict(), model_sha256=fingerprint(model),
                        iteration=500, total_games=2000))
            (directory / 'stop.flag').touch()
            with patch('scheduled_evaluation.Bridge', return_value=contextlib.nullcontext()), \
                    patch('train.paired_state', return_value=Mock(is_terminal=lambda: False)):
                run(directory, 2000, 2, 128, 1)
            result = json.loads((directory / 'a9-milestones/games-00002000/result.json').read_text())
            self.assertEqual(result['pairs'], 0)
            self.assertFalse(result['complete'])


if __name__ == '__main__':
    unittest.main()
