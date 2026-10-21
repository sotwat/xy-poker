"""Necessary support constraints from bounded winner utility in saved worlds."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys


def support_certificate(worlds, baseline, count):
    witnesses = [None] * count
    for wi, world in enumerate(worlds):
        for profile, arms in enumerate(world['arms']):
            values = [arm['win'] for arm in arms]
            assert len(values) == count and all(v in (-1, 0, 1) for v in values)
            if values[baseline] != 1:
                continue
            for action, value in enumerate(values):
                if value < 1 and witnesses[action] is None:
                    witnesses[action] = dict(world=wi, profile=profile, candidateWin=value)
    allowed = [i for i, witness in enumerate(witnesses) if witness is None]
    assert baseline in allowed
    return dict(allowed=allowed, witnesses=witnesses, baselineOnly=allowed == [baseline])


def fixture(rows):
    return [dict(arms=[[dict(win=v) for v in row]]) for row in rows]


def main():
    limit = dt.datetime.fromisoformat(sys.argv[1].replace('Z', '+00:00'))
    started = dt.datetime.now(dt.timezone.utc)
    assert started < limit <= started + dt.timedelta(minutes=30)
    assert support_certificate(fixture([[1, 0, 1], [1, 1, -1]]), 0, 3)['allowed'] == [0]
    assert support_certificate(fixture([[1, 1], [0, -1]]), 0, 2)['allowed'] == [0, 1]
    assert support_certificate(fixture([[0, 1, -1], [0, -1, 1]]), 0, 3)['allowed'] == [0, 1, 2]
    source = Path('gto_constrained_mixture_worlds_20261021.json')
    data = json.loads(source.read_text())
    rows = []
    for group in data['groups']:
        for ri, row in enumerate(group['rows']):
            assert dt.datetime.now(dt.timezone.utc) < limit
            assert [b['split'] for b in row['batches']] == ['fit', 'heldout']
            batches = [b['worlds'] for b in row['batches']]
            certs = [support_certificate(worlds, row['baseline'], len(row['actions'])) for worlds in batches]
            both = support_certificate(batches[0] + batches[1], row['baseline'], len(row['actions']))
            newly_blocked = [a for a in certs[0]['allowed'] if a not in certs[1]['allowed']]
            rows.append(dict(phase=group['phase'], row=ri, deal=row['deal'], swap=row['swap'],
                             baseline=row['baseline'], fit=certs[0], heldout=certs[1],
                             combined=both, fitAllowedBlockedInHeldout=newly_blocked))
    summary = []
    for phase in ['selection', 'confirmation']:
        unique = [r for r in rows if r['phase'] == phase and r['swap'] == 0]
        summary.append(dict(phase=phase, deals=len(unique),
                            fitBaselineOnly=sum(r['fit']['baselineOnly'] for r in unique),
                            heldoutBaselineOnly=sum(r['heldout']['baselineOnly'] for r in unique),
                            combinedBaselineOnly=sum(r['combined']['baselineOnly'] for r in unique),
                            fitSurvivorsBlocked=sum(len(r['fitAllowedBlockedInHeldout']) for r in unique)))
    paths = [source, Path(__file__)]
    output = dict(kind='posthoc-finite-world-win-preservation-not-production-safety',
                  startedUtc=started.isoformat(), endedUtc=dt.datetime.now(dt.timezone.utc).isoformat(),
                  deadlineUtc=limit.isoformat(), newGames=0, actualA9Games=0,
                  sourceHashes={str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
                  rows=rows, summary=summary)
    assert dt.datetime.now(dt.timezone.utc) < limit
    with Path('gto_win_preservation_20261022.json').open('x') as f:
        json.dump(output, f, indent=2)
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
