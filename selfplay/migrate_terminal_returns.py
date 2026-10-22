"""Explicit, lossless checkpoint migration for PR #8's terminal reward fix.

Old search targets are retained as historical training data. Actual episode
rewards must first be checked against the reducer with audit_saved_returns.py.
"""
import argparse
from contextlib import ExitStack
import datetime as dt
import fcntl
import hashlib
import json
from pathlib import Path
import shutil

import torch

from environment import ACTIONS, FEATURES, rules_digest
from train import SCHEMA, atomic_save, load_checkpoint

OLD_RULES = '3ae8806a36a2e169557da1c80ac11b0482fb6a3f05bd8fa5b011c9024c698618'
NEW_RULES = 'd7a07ab1088a9717c258e19b1a014d481db2fefb5d67d09103bb9c4db1646fdd'
MIGRATION = 'terminal-winner-returns-v1'


def identical(left, right):
    if type(left) is not type(right):
        return False
    if isinstance(left, torch.Tensor):
        return (left.dtype == right.dtype and left.shape == right.shape
                and torch.equal(left.reshape(-1).view(torch.uint8),
                                right.reshape(-1).view(torch.uint8)))
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(identical(left[k], right[k]) for k in left)
    if isinstance(left, (list, tuple)):
        return len(left) == len(right) and all(identical(a, b) for a, b in zip(left, right))
    return left == right


def converted(saved, source_sha256):
    if rules_digest() != NEW_RULES:
        raise ValueError('Migration requires the exact reviewed PR #8 rules implementation')
    if (saved.get('schema'), saved.get('features'), saved.get('actions')) != (SCHEMA, FEATURES, ACTIONS):
        raise ValueError('Checkpoint schema mismatch')
    if saved.get('rules_sha256') != OLD_RULES:
        raise ValueError('Only the allowlisted pre-PR #8 rules can be migrated')
    result = dict(saved)
    result['rules_sha256'] = NEW_RULES
    result['checkpoint_migrations'] = [*saved.get('checkpoint_migrations', []), dict(
        migration=MIGRATION, source_sha256=source_sha256, from_rules=OLD_RULES,
        to_rules=NEW_RULES, historical_search_targets='retained; not recomputed')]
    return result


def verify_preserved(before, after):
    restored = dict(after)
    restored['rules_sha256'] = before['rules_sha256']
    if 'checkpoint_migrations' in before:
        restored['checkpoint_migrations'] = before['checkpoint_migrations']
    else:
        restored.pop('checkpoint_migrations', None)
    if not identical(before, restored):
        raise ValueError('Migration altered learned checkpoint state')


def migrate(directory, backup, audit_path):
    torch.set_num_threads(2)
    directory, backup = directory.resolve(), backup.resolve()
    if backup == directory or directory in backup.parents:
        raise ValueError('Backup must be outside the training directory')
    if not (directory / 'stop.flag').exists():
        raise ValueError('Stop the supervisor and trainer before migration')
    with ExitStack() as stack:
        for name in ('supervisor.lock', 'run.lock'):
            lock = stack.enter_context((directory / name).open('a'))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        latest = torch.load(directory / 'latest.pt', weights_only=True, map_location='cpu')
        raw_events = (directory / 'events.jsonl').read_bytes()
        audit = json.loads(audit_path.read_text())
        reports = [r for r in audit['reports'] if r['input_sha256'] == hashlib.sha256(raw_events).hexdigest()]
        if (len(reports) != 1 or reports[0]['games'] != latest['total_games']
                or reports[0]['unique_seed_seats'] != latest['total_games']
                or reports[0]['snapshot_bytes'] != len(raw_events)
                or reports[0]['mismatches'] or reports[0]['score_disagreements']):
            raise ValueError('A complete, current reducer reward audit is required')
        paths = sorted(directory.rglob('*.pt'))
        # Preflight every retained generation and milestone before any mutation.
        for path in paths:
            converted(torch.load(path, weights_only=True, map_location='cpu'), '')
        shutil.copytree(directory, backup)
        manifest = dict(migration=MIGRATION, backup=str(backup), from_rules=OLD_RULES,
                        to_rules=NEW_RULES, audit=audit, files=[], complete=False)
        manifest_path = directory / 'terminal-return-migration.json'
        for path in paths:
            relative = path.relative_to(directory)
            original = backup / relative
            source_hash = hashlib.sha256(original.read_bytes()).hexdigest()
            before = torch.load(original, weights_only=True, map_location='cpu')
            after = converted(before, source_hash)
            verify_preserved(before, after)
            atomic_save(path, after)
            verify_preserved(before, load_checkpoint(path))
            manifest['files'].append(dict(path=str(relative), source_sha256=source_hash,
                                          migrated_sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
            manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        manifest['complete'] = True
        manifest['completed_utc'] = dt.datetime.now(dt.timezone.utc).isoformat()
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        print(json.dumps(dict(files=len(paths), iteration=latest['iteration'],
                              total_games=latest['total_games'], replay=len(latest['replay']),
                              population=len(latest['population']), backup=str(backup), complete=True)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--backup', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    args = parser.parse_args()
    migrate(args.output, args.backup, args.audit)
