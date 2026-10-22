# Terminal reward checkpoint migration

PR #8 corrects the terminal reward from score sign to the reducer's explicit
winner. Royal flushes can finish before scores are updated. The observation,
action encoding, card transitions, and network layout are unchanged.

`migrate_terminal_returns.py` accepts only the exact reviewed old and new rule
digests. Normal checkpoint loading still rejects every mismatched digest.
Migration preserves every original payload field, including network tensors,
AdamW moments, replay samples and targets, opponent population, both RNG states,
configuration, and partial-generation counters. It adds a provenance record.
Future saves and scheduled snapshots retain that record.

Stop the supervisor with `npm run selfplay:stop -- .selfplay/final-verification`
and wait until both supervisor and child have exited. The migration additionally
requires `stop.flag` and exclusive supervisor/trainer locks. Run a frozen-log
audit with `audit_saved_returns.py --deadline <UTC deadline within 30 minutes>
<output>/events.jsonl`, redirecting its JSON output to an audit file. All saved
episodes must agree with the actual reducer and match `latest.pt`'s game count.

Run, from this worktree:

```sh
nice -n 10 .venv-selfplay/bin/python selfplay/migrate_terminal_returns.py \
  --output .selfplay/final-verification \
  --backup .selfplay/pre-terminal-returns-20261022 \
  --audit /path/to/frozen-audit.json
```

The backup must be outside the training directory and must not already exist.
All retained `*.pt` files are preflighted before copying the entire output
directory. Each migrated file is reloaded and compared bit for bit with its
backup, excluding the rule digest and new provenance metadata. The local
`terminal-return-migration.json` records hashes and completion. Backups, models,
and logs stay outside Git.

Only after `complete: true`, remove `stop.flag` and restart the usual supervisor.
If migration is interrupted or fails, leave the stop flag in place. The backup
contains the entire untouched run. With both locks free, preserve the failed
directory separately and restore the backup into the original output path;
then investigate and rerun the audit/migration before starting the new code.
Never bypass `load_checkpoint` or remove the rule check to resume.

Historical search visit distributions and learned weights are retained, not
recomputed. A clean saved-episode audit does not prove that old virtual search
rewards were unaffected. Historical A9 results remain historical; migration
does not change their recorded outcomes or demonstrate stronger play.
