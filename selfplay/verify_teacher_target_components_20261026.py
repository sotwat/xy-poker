"""Check exported scoring arithmetic against each committed teacher terminal."""
import json

from collect_teacher_targets_20261026 import DIRECTORY, ROOT, digest, save, sha


def run():
    manifest=json.loads((DIRECTORY/'manifest.json').read_text())
    path=ROOT/'gto_teacher_target_components_20261026.json'
    components=json.loads(path.read_text())
    assert components['signature']==manifest['signature']
    assert components['input_sha256']==sha(DIRECTORY/'manifest.json')
    assert len(components['rows'])==len(manifest['completed'])
    seen=set()
    for row in components['rows']:
        assert row['id'] not in seen
        seen.add(row['id'])
        raw_path=DIRECTORY/(row['id']+'.json')
        assert sha(raw_path)==manifest['completed'][row['id']]
        raw=json.loads(raw_path.read_text())
        assert all(row[k]==raw[k] for k in ('group','stage','seed','mirror','actor'))
        out=row['outcomes']['teacher']
        y=[sum(col['points'] for col in out['columns'] if col['winner']==seat) for seat in (0,1)]
        assert y==out['y']
        if out['royalWinner'] is None:
            scores=[out['x'][i]+y[i] for i in (0,1)]
            assert scores==out['recorded']==raw['scores']
            margin=scores[row['actor']]-scores[1-row['actor']]
            utility=(margin>0)-(margin<0)
        else:
            assert out['recorded']==raw['scores']
            utility=1 if out['royalWinner']==row['actor'] else -1
        assert utility==out['utility']==raw['teacher_z']
        assert out['scoreMargin']==raw['scores'][row['actor']]-raw['scores'][1-row['actor']]
    assert seen==set(manifest['completed'])
    components['independent_arithmetic_verified']=True
    components['root_hashes_sha256']=digest(manifest['completed'])
    save(path,components)
    print(json.dumps(dict(roots=len(seen),complete=manifest['complete'],arithmetic_verified=True)))


if __name__=='__main__':
    run()
