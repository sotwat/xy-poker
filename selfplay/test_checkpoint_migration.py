import copy
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import torch

from environment import ACTIONS, FEATURES
from migrate_terminal_returns import (NEW_RULES, OLD_RULES, converted, identical,
                                      migrate, verify_preserved)
from train import (SCHEMA, PolicyValue, atomic_save, fingerprint, load_checkpoint,
                   rng_pack, run_training)


class CheckpointMigrationTests(unittest.TestCase):
    def payload(self):
        torch.set_num_threads(2)
        model = PolicyValue(8)
        optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=1e-4)
        sum(t.sum() for t in model.parameters()).backward()
        optimizer.step()
        return dict(schema=SCHEMA, features=FEATURES, actions=ACTIONS,
                    rules_sha256=OLD_RULES,
                    config=dict(seed=42, width=8, simulations=2, games=4, steps=1,
                                batch_size=1, replay_size=20000, learning_rate=.001),
                    model=model.state_dict(), optimizer=optimizer.state_dict(),
                    replay=[dict(x=torch.ones(FEATURES), pi=torch.ones(ACTIONS) / ACTIONS,
                                 mask=torch.ones(ACTIONS, dtype=torch.bool), z=-1.)],
                    population=[copy.deepcopy(model.state_dict())], iteration=7,
                    games_done=2, total_games=30, rng=rng_pack(np.random.RandomState(5)),
                    torch_rng=torch.get_rng_state(), model_sha256=fingerprint(model))

    def test_preserves_all_state_and_resumes_without_reset(self):
        before = self.payload()
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            path = directory / 'latest.pt'
            atomic_save(path, converted(before, 'source-hash'))
            verify_preserved(before, load_checkpoint(path))
            args = SimpleNamespace(**before['config'], resume=True, minutes=1e-9,
                                   iterations=1, eval_pairs=0, eval_seed=2**31)
            run_training(args, directory)
            resumed = load_checkpoint(path)
            self.assertEqual(resumed.pop('training_method'), 'mixed-a9-teacher-worlds8-v1')
            verify_preserved(before, resumed)
            self.assertEqual(resumed['checkpoint_migrations'][0]['source_sha256'], 'source-hash')
            corrupted = copy.deepcopy(resumed)
            corrupted['optimizer']['state'][0]['exp_avg'].add_(1)
            with self.assertRaises(ValueError):
                verify_preserved(before, corrupted)

    def test_rejects_other_rules_and_layouts_and_double_migration(self):
        for key, value in [('rules_sha256', 'unknown'), ('features', FEATURES + 1),
                           ('actions', ACTIONS + 1), ('schema', SCHEMA + 1)]:
            saved = self.payload()
            saved[key] = value
            with self.assertRaises(ValueError):
                converted(saved, 'source')
        with self.assertRaises(ValueError):
            converted(converted(self.payload(), 'source'), 'source')
        with patch('migrate_terminal_returns.rules_digest', return_value='future-rules'):
            with self.assertRaises(ValueError):
                converted(self.payload(), 'source')

    def test_backup_and_all_checkpoint_kinds_and_audit_gate(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            directory = root / 'training'
            directory.mkdir()
            saved = self.payload()
            atomic_save(directory / 'latest.pt', saved)
            atomic_save(directory / 'model-00007.pt', saved)
            (directory / 'stop.flag').touch()
            (directory / 'events.jsonl').write_text('{}\n')
            audit_path = root / 'audit.json'
            report = dict(input_sha256=hashlib.sha256(b'{}\n').hexdigest(),
                          snapshot_bytes=3, games=30, unique_seed_seats=30,
                          mismatches=[], score_disagreements=0)
            audit_path.write_text(json.dumps(dict(reports=[report])))
            original = (directory / 'latest.pt').read_bytes()
            report['games'] = 29
            audit_path.write_text(json.dumps(dict(reports=[report])))
            with self.assertRaises(ValueError):
                migrate(directory, root / 'backup', audit_path)
            self.assertFalse((root / 'backup').exists())
            report['games'] = 30
            audit_path.write_text(json.dumps(dict(reports=[report])))
            migrate(directory, root / 'backup', audit_path)
            self.assertEqual((root / 'backup/latest.pt').read_bytes(), original)
            for name in ('latest.pt', 'model-00007.pt'):
                verify_preserved(saved, load_checkpoint(directory / name))
                self.assertEqual(load_checkpoint(directory / name)['rules_sha256'], NEW_RULES)
            self.assertTrue(json.loads((directory / 'terminal-return-migration.json').read_text())['complete'])
            self.assertTrue(identical(saved, torch.load(root / 'backup/latest.pt', weights_only=True)))


if __name__ == '__main__':
    unittest.main()
