"""Recount target provenance by source, stage and game/actor clusters."""
import collections
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
raw=(ROOT/'gto_target_semantics_20261026.json').read_bytes()
d=json.loads(raw)
assert d['complete'] and d['live_before']==d['live_after']
assert len(d['manifest'])==64 and len({m['seed'] for m in d['manifest']})==64
byseed={m['seed']:m for m in d['manifest']}
counts=collections.Counter()
for m in d['manifest']:
    assert m['total_games']>=14600
    kind=m['kind']
    assert m['split']==('confirmation' if counts[kind]%4==3 else 'selection')
    counts[kind]+=1
assert set(counts.values())=={16}
clusters=collections.defaultdict(list)
for r in d['rows']:
    m=byseed[r['seed']]
    expected=('teacher-a9-selfplay' if m['kind']=='teacher-selfplay' else
              ('teacher-a9-advice' if r['actor']==m['model_seat'] else 'teacher-a9') if m['kind']=='baseline' else 'search')
    assert r['source']==expected and r['teacher']==expected.startswith('teacher-')
    assert r['split']==m['split'] and r['z'] in (-1,0,1)
    assert 0<=r['executed_target_mass']<=1 and r['move'] in range(31)
    assert r['stage']==('early' if r['move']<11 else 'middle' if r['move']<21 else 'late')
    if r['teacher']:
        assert r['executed_target_mass']==int(r['target']==r['executed'])
    clusters[(r['seed'],r['actor'])].append(r)
for rows in clusters.values():
    assert len({r['z'] for r in rows})==1

def stats(rows):
    games=collections.defaultdict(list)
    for r in rows:games[(r['seed'],r['actor'])].append(r)
    return dict(rows=len(rows),game_actor_clusters=len(games),
                labels=dict(collections.Counter(str(int(r['z'])) for r in rows)),
                mean_z=sum(r['z'] for r in rows)/len(rows),
                mean_cluster_z=sum(rs[0]['z'] for rs in games.values())/len(games),
                argmax_matches=sum(r['target']==r['executed'] for r in rows),
                mean_executed_target_mass=sum(r['executed_target_mass'] for r in rows)/len(rows))
summary=dict(input_sha256=hashlib.sha256(raw).hexdigest(),games=64,rows=len(d['rows']),groups={})
for split in ['selection','confirmation']:
    for source in sorted({r['source'] for r in d['rows']}):
        rows=[r for r in d['rows'] if r['split']==split and r['source']==source]
        summary['groups'][split+'/'+source]=stats(rows)
        if source=='teacher-a9-advice':
            for agreement in [False,True]:
                subset=[r for r in rows if (r['target']==r['executed'])==agreement]
                if subset:summary['groups'][split+'/advice-agrees-'+str(agreement)]=stats(subset)
            for stage in ['early','middle','late']:
                summary['groups'][split+'/advice-'+stage]=stats([r for r in rows if r['stage']==stage])
(ROOT/'gto_target_semantics_summary_20261026.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
