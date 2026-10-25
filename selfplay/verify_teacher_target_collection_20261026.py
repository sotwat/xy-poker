"""Replay committed roots without new A9 calls; incomplete roots never count."""
import fcntl
import json
from contextlib import ExitStack

from collect_teacher_targets_20261026 import (DIRECTORY, LIVE, ROOT, Deadline, card_check, descriptors,
    digest, root_for, save, sha, validate_reply)
from freeze_teacher_target_inputs_20261026 import validate_finished
from environment import Bridge
from train import paired_state


def verify():
    before = sha(LIVE / 'latest.pt')
    manifest = json.loads((DIRECTORY / 'manifest.json').read_text())
    validate_finished(manifest)
    overlap=json.loads((ROOT/'gto_teacher_target_overlap_20261026.json').read_text())
    assert overlap['passed'] and overlap['source_sha256']==manifest['source_sha256']
    exported=[]
    summary = dict(complete=manifest['complete'], signature=manifest['signature'], roots=0,
                   source_games=len(manifest['source']), moves=0, null_calls=0, teacher_calls=0,
                   proof_calls=0, incomplete_proofs=0, root_hashes={}, groups={})
    deadline = Deadline()
    with Bridge() as bridge:
        for source in manifest['source']:
            match=source['match']
            state=paired_state(bridge,match['seed'],match['swap'])
            for action in match['actions']:
                state.apply_action(action)
                card_check(state.data)
            assert state.is_terminal() and list(state.returns())==match['returns']
            assert [p['score'] for p in state.data['players']]==match['scores']
        for desc in descriptors(manifest):
            deadline.remaining()
            if desc['id'] not in manifest['completed']:
                continue
            path=DIRECTORY/(desc['id']+'.json')
            assert sha(path)==manifest['completed'][desc['id']]
            row=json.loads(path.read_text())
            assert row['complete'] and all(row[k]==v for k,v in desc.items())
            source=manifest['source'][desc['source_index']]
            state,actor,prefix,x,mask=root_for(bridge,source,desc['stage'],desc['mirror'])
            assert row['root']==state.data and row['prefix']==prefix and row['actor']==actor==state.current_player()
            assert row['x']==x and row['mask']==mask
            assert row['factual_z']==source['match']['returns'][source['match']['model_seat']]
            assert len(row['null'])==3 and len({t['reply']['action'] for t in row['null']})==1
            assert row['teacher_action']==row['null'][0]['reply']['action']
            assert row['decisions'][0]==row['null'][0]
            assert len(row['moves'])==len(row['decisions'])==31-len(prefix)
            for trace in row['null']:
                assert trace['complete']
                assert trace['request']==dict(state=row['root'],seed=(desc['seed']^0x102687)+len(prefix),proofLimit=1_000_000)
                validate_reply(trace['reply'],state)
            traces=list(row['null'])
            for step,(action,trace) in enumerate(zip(row['moves'],row['decisions'])):
                assert trace['complete']
                assert trace['request']==dict(state=state.data,seed=(desc['seed']^0x102687)+len(prefix)+step,proofLimit=1_000_000)
                validate_reply(trace['reply'],state)
                assert trace['reply']['action']==action
                state.apply_action(action)
                card_check(state.data)
                if step: traces.append(trace)
            assert state.is_terminal() and state.data==row['final']
            assert row['teacher_z']==float(state.returns()[actor])
            assert row['scores']==[p['score'] for p in state.data['players']]
            exported.append({k:row[k] for k in ('id','group','source_index','seed','stage','mirror','actor','prefix','x','mask','teacher_action','factual_z','teacher_z')})
            summary['roots']+=1
            summary['moves']+=len(row['moves'])
            summary['null_calls']+=3
            summary['teacher_calls']+=len(traces)
            summary['root_hashes'][desc['id']]=sha(path)
            for trace in traces:
                for proof in trace['reply']['proofs']:
                    summary['proof_calls']+=1
                    summary['incomplete_proofs']+=int(proof['status']=='incomplete')
            group=summary['groups'].setdefault(desc['group'],dict(roots=0, factual=[],teacher=[],games=[]))
            group['roots']+=1
            group['factual'].append(row['factual_z'])
            group['teacher'].append(row['teacher_z'])
            if row['seed'] not in group['games']: group['games'].append(row['seed'])
    assert summary['roots']==len(manifest['completed'])
    assert not summary['complete'] or summary['roots']==192
    assert all(c['before_sha256']==c['after_sha256'] for c in manifest['chunks'])
    assert sha(LIVE/'latest.pt')==before
    summary['live_verification_sha256']=before
    summary['roots_sha256']=digest(summary['root_hashes'])
    summary['chunks']=manifest['chunks']
    summary['interrupted_attempts']=[]
    for path in sorted(DIRECTORY.glob('*.attempt-*.json')):
        attempt=json.loads(path.read_text())
        summary['interrupted_attempts'].append(dict(path=path.name,sha256=sha(path),complete=attempt['complete'],
            completed_null_calls=len(attempt['null']),completed_moves=len(attempt['moves']),failure=attempt.get('failure'),
            active_call_has_reply='reply' in attempt.get('active_call',{})))
    save(ROOT/'gto_teacher_target_dataset_20261026.json',dict(complete=manifest['complete'],signature=manifest['signature'],source=manifest['source'],
         source_sha256=manifest['source_sha256'],frozen_sha256=manifest['frozen_sha256'],rows=exported,root_hashes=summary['root_hashes']))
    summary['dataset_sha256']=sha(ROOT/'gto_teacher_target_dataset_20261026.json')
    save(ROOT/'gto_teacher_target_collection_summary_20261026.json',summary)
    print(json.dumps({k:summary[k] for k in ('complete','roots','moves','teacher_calls','proof_calls','incomplete_proofs')}))


if __name__=='__main__':
    assert (LIVE/'stop.flag').exists()
    with ExitStack() as stack:
        for name in ('supervisor.lock','run.lock'):
            handle=stack.enter_context((LIVE/name).open('a+'))
            fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        verify()
