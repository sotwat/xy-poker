"""Read-only audit of the self-play opponent/seat schedule; no model loading."""
import argparse
from collections import Counter
import datetime as dt
import hashlib
import json
from pathlib import Path


def audit(raw, deadline):
    groups = {'before_migration': [], 'after_migration': []}
    for line in raw.splitlines():
        if dt.datetime.now(dt.timezone.utc) >= deadline:
            raise TimeoutError('Audit deadline exceeded')
        event = json.loads(line)
        if event.get('event') == 'selfplay':
            groups['before_migration' if event['total_games'] <= 4772 else 'after_migration'].append(event)
    results = {}
    for name, events in groups.items():
        mature = [e for e in events if e['iteration'] >= 4 and e['opponent'] == 'past-model']
        # The stored population is capped at four after the fourth update.
        cells = Counter(((e['total_games'] - 1) % 4, e['match']['model_seat']) for e in mature)
        assert all((e['total_games'] - 1) % 4 == 3 for e in mature)
        assert all(e['match']['model_seat'] == (e['total_games'] - 1) % 2 for e in mature)
        results[name] = dict(episodes=len(events), past_model_episodes=len(mature),
                             observed_seats=sorted({e['match']['model_seat'] for e in mature}),
                             code_implied_population_index_seat=[dict(index=i, seat=s, count=n)
                                                                 for (i, s), n in sorted(cells.items())],
                             first_game=events[0]['total_games'] if events else None,
                             last_game=events[-1]['total_games'] if events else None)
    # A scheduling counterexample only: no claims about search or playing strength.
    proposed = Counter()
    legacy = Counter()
    for iteration in range(4, 36):
        total = 4 * iteration + 3
        legacy[(total % 4, total % 2)] += 1
        episode = total // 4
        proposed[(episode % 4, (episode // 4) % 2)] += 1
    assert len(legacy) == 1 and len(proposed) == 8 and set(proposed.values()) == {4}
    return dict(snapshot_bytes=len(raw), input_sha256=hashlib.sha256(raw).hexdigest(),
                groups=results, synthetic_full_population_episodes=32,
                legacy_unique_index_seats=len(legacy), proposed_unique_index_seats=len(proposed),
                proposed_count_per_cell=4, candidate_applied=False,
                new_games=0, production_changed=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--events', required=True, type=Path)
    parser.add_argument('--deadline', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    deadline = dt.datetime.fromisoformat(args.deadline.replace('Z', '+00:00'))
    started = dt.datetime.now(dt.timezone.utc)
    assert started < deadline <= started + dt.timedelta(minutes=30)
    raw = args.events.read_bytes()
    raw = raw[:raw.rfind(b'\n') + 1]
    result = audit(raw, deadline)
    result.update(started_utc=started.isoformat(), ended_utc=dt.datetime.now(dt.timezone.utc).isoformat())
    args.output.write_text(json.dumps(result, indent=2) + '\n')
