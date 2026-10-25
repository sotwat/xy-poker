"""Ledger87 fixed-endpoint copy trial; neither arm changes the live learner."""
import copy
import fcntl
import json
from contextlib import ExitStack

import numpy as np
import torch

from collect_teacher_targets_20261026 import DIRECTORY, LIVE, ROOT, Deadline, digest, save, sha
from freeze_teacher_target_inputs_20261026 import validate_finished
from train import PolicyValue, fingerprint, load_checkpoint


def tensors(rows):
    return (torch.tensor([r['x'] for r in rows]), torch.tensor([r['mask'] for r in rows], dtype=torch.bool),
            torch.tensor([r['teacher_action'] for r in rows]), torch.tensor([r['factual_z'] for r in rows]),
            torch.tensor([r['teacher_z'] for r in rows]))


def metrics(model, rows):
    x,mask,actions,factual,teacher=tensors(rows)
    with torch.no_grad():
        logits,value=model(x)
        logp=torch.log_softmax(logits.masked_fill(~mask,-1e9),dim=1)
        ce=-logp[torch.arange(len(rows)),actions]
        top=(logp.argmax(1)==actions).float()
        tmse=(value-teacher).square()
        fmse=(value-factual).square()
    values=dict(teacher_ce=ce.tolist(),top1=top.tolist(),teacher_mse=tmse.tolist(),factual_mse=fmse.tolist())
    def subset(indices):
        return dict(n=len(indices),**{key:float(np.mean([v[i] for i in indices])) for key,v in values.items()})
    return dict(overall=subset(range(len(rows))),
                stages={str(stage):subset([i for i,r in enumerate(rows) if r['stage']==stage]) for stage in (5,13,21)},
                games={str(seed):subset([i for i,r in enumerate(rows) if r['seed']==seed]) for seed in dict.fromkeys(r['seed'] for r in rows)},
                predictions=[dict(id=r.get('id',str(i)),seed=r['seed'],stage=r['stage'],
                                  teacher_logp=float(logp[i,actions[i]]),selected_action=int(logp[i].argmax()),
                                  teacher_action=r['teacher_action'],value=float(value[i]),
                                  factual_z=r['factual_z'],teacher_z=r['teacher_z']) for i,r in enumerate(rows)])


def gate(control,candidate):
    checks={}
    for name in ('overall','5','13','21'):
        a=control['overall'] if name=='overall' else control['stages'][name]
        b=candidate['overall'] if name=='overall' else candidate['stages'][name]
        checks[name]=dict(teacher_mse=b['teacher_mse']<a['teacher_mse'],
                          teacher_ce=b['teacher_ce']<=a['teacher_ce'],top1=b['top1']>=a['top1'])
    return dict(passed=all(all(x.values()) for x in checks.values()),checks=checks)


def equal_state(a,b):
    if isinstance(a,torch.Tensor):
        return isinstance(b,torch.Tensor) and torch.equal(a,b)
    if isinstance(a,dict):
        return a.keys()==b.keys() and all(equal_state(a[k],b[k]) for k in a)
    if isinstance(a,(tuple,list)):
        return len(a)==len(b) and all(equal_state(x,y) for x,y in zip(a,b))
    return a==b


def run():
    torch.set_num_threads(1)
    torch.manual_seed(100526087)
    target=ROOT/'gto_teacher_target_fit_20261026.json'
    assert not target.exists(), 'Single fixed endpoint already measured; do not refit'
    assert (LIVE/'stop.flag').exists()
    deadline=Deadline()
    before=sha(LIVE/'latest.pt')
    manifest=json.loads((DIRECTORY/'manifest.json').read_text())
    validate_finished(manifest)
    assert manifest['complete'] and len(manifest['completed'])==192
    overlap=json.loads((ROOT/'gto_teacher_target_overlap_20261026.json').read_text())
    assert overlap['passed'] and not overlap['overlap'] and overlap['source_sha256']==manifest['source_sha256']
    verified=json.loads((ROOT/'gto_teacher_target_collection_summary_20261026.json').read_text())
    components=json.loads((ROOT/'gto_teacher_target_components_20261026.json').read_text())
    assert verified['complete'] and verified['roots']==192 and verified['signature']==manifest['signature']
    assert verified['dataset_sha256']==sha(ROOT/'gto_teacher_target_dataset_20261026.json')
    assert components['complete'] and components['signature']==manifest['signature']
    assert components['input_sha256']==sha(DIRECTORY/'manifest.json')
    assert components['independent_arithmetic_verified']
    rows=[]
    for key,expected in manifest['completed'].items():
        path=DIRECTORY/(key+'.json')
        assert sha(path)==expected==verified['root_hashes'][key]
        rows.append(json.loads(path.read_text()))
    splits={name:[r for r in rows if r['group']==name] for name in ('update','selection','confirmation')}
    assert [len(splits[n]) for n in splits]==[96,48,48]
    game_sets={name:{r['seed'] for r in subset} for name,subset in splits.items()}
    assert [len(game_sets[n]) for n in splits]==[16,8,8]
    assert all(not game_sets[a]&game_sets[b] for a,b in (('update','selection'),('update','confirmation'),('selection','confirmation')))
    frozen=ROOT/'.selfplay/diagnostic-target-semantics-20261026/checkpoint.pt'
    saved=load_checkpoint(frozen)
    original_model=copy.deepcopy(saved['model'])
    original_optimizer=copy.deepcopy(saved['optimizer'])
    base=PolicyValue(saved['config']['width']).eval()
    base.load_state_dict(saved['model'])
    assert fingerprint(base)==saved['model_sha256']
    initial={name:metrics(base,subset) for name,subset in splits.items()}
    rng=np.random.RandomState(100526087)
    batches=rng.randint(len(splits['update']),size=(32,64)).tolist()
    models,optimizers={},{}
    for name in ('factual','teacher'):
        models[name]=copy.deepcopy(base)
        optimizers[name]=torch.optim.AdamW(models[name].parameters())
        optimizers[name].load_state_dict(copy.deepcopy(saved['optimizer']))
        assert equal_state(models[name].state_dict(),original_model)
        assert equal_state(optimizers[name].state_dict(),original_optimizer)
    x,mask,actions,factual,teacher=tensors(splits['update'])
    losses={name:[] for name in models}
    for batch in batches:
        deadline.remaining()
        for name,model in models.items():
            model.train()
            logits,value=model(x[batch])
            ce=torch.nn.functional.cross_entropy(logits.masked_fill(~mask[batch],-1e9),actions[batch])
            targets=factual if name=='factual' else teacher
            mse=(value-targets[batch]).square().mean()
            loss=ce+mse
            assert torch.isfinite(loss)
            optimizers[name].zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(),5)
            optimizers[name].step()
            losses[name].append(dict(ce=float(ce.detach()),mse=float(mse.detach())))
    final={}
    for name,model in models.items():
        model.eval()
        final[name]={split:metrics(model,subset) for split,subset in splits.items()}
    gates={split:gate(final['factual'][split],final['teacher'][split]) for split in ('selection','confirmation')}
    assert equal_state(saved['model'],original_model) and equal_state(saved['optimizer'],original_optimizer)
    assert equal_state(base.state_dict(),original_model)
    assert sha(frozen)==manifest['frozen_sha256'] and sha(LIVE/'latest.pt')==before
    for name,model in models.items():
        torch.save(dict(model=model.state_dict(),optimizer=optimizers[name].state_dict(),
                        initial_sha256=manifest['frozen_sha256'],signature=manifest['signature']), DIRECTORY/f'{name}-copy.pt')
    result=dict(complete=True,signature=manifest['signature'],initial=initial,final=final,gates=gates,
                mechanism_gate_passed=all(x['passed'] for x in gates.values()),adopted=False,
                batches=batches,update_row_ids=[r['id'] for r in splits['update']],batches_sha256=digest(batches),seed=100526087,steps=32,batch_size=64,
                losses=losses,live_before_sha256=before,live_after_sha256=sha(LIVE/'latest.pt'),
                source_sha256=manifest['source_sha256'],frozen_sha256=manifest['frozen_sha256'],
                original_model_and_adamw_preserved=True,scope='Different value estimands on correlated saved learning games; no production-strength inference')
    save(target,result)
    print(json.dumps(dict(complete=True,mechanism_gate_passed=result['mechanism_gate_passed'],gates=gates)))


if __name__=='__main__':
    with ExitStack() as stack:
        for name in ('supervisor.lock','run.lock'):
            handle=stack.enter_context((LIVE/name).open('a+'))
            fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        run()
