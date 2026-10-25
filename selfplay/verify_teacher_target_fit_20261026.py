"""Recalculate fit metrics and gates from frozen predictions, without updates."""
import json
import math

import torch
import numpy as np

from collect_teacher_targets_20261026 import DIRECTORY, ROOT, digest, save, sha
from train import load_checkpoint


def run():
    path=ROOT/'gto_teacher_target_fit_20261026.json'
    result=json.loads(path.read_text())
    dataset=json.loads((ROOT/'gto_teacher_target_dataset_20261026.json').read_text())
    assert result['complete'] and dataset['complete'] and len(dataset['rows'])==192
    assert not result['adopted'] and result['steps']==32 and result['batch_size']==64 and result['seed']==100526087
    assert result['live_before_sha256']==result['live_after_sha256']
    assert result['signature']==dataset['signature'] and result['source_sha256']==dataset['source_sha256']
    assert len(result['batches'])==32 and all(len(b)==64 and all(0<=i<96 for i in b) for b in result['batches'])
    assert result['update_row_ids']==[r['id'] for r in dataset['rows'] if r['group']=='update']
    assert digest(result['batches'])==result['batches_sha256']
    assert result['batches']==np.random.RandomState(100526087).randint(96,size=(32,64)).tolist()
    lookups={group:{r['id']:r for r in dataset['rows'] if r['group']==group} for group in ('update','selection','confirmation')}
    checked=0
    for measurements in [result['initial'],*result['final'].values()]:
        for group,table in measurements.items():
            predictions=table['predictions']
            assert {p['id'] for p in predictions}==set(lookups[group]) and len(predictions)==len(lookups[group])
            for p in predictions:
                r=lookups[group][p['id']]
                assert all(p[k]==r[k] for k in ('seed','stage','teacher_action','factual_z','teacher_z'))
                assert r['mask'][p['selected_action']] and -1<=p['value']<=1 and math.isfinite(p['teacher_logp'])
            groups=[(predictions,table['overall'])]
            groups.extend(([p for p in predictions if str(p['stage'])==stage],aggregate) for stage,aggregate in table['stages'].items())
            groups.extend(([p for p in predictions if str(p['seed'])==seed],aggregate) for seed,aggregate in table['games'].items())
            for subset,aggregate in groups:
                assert aggregate['n']==len(subset)
                values=dict(teacher_ce=sum(-p['teacher_logp'] for p in subset)/len(subset),
                            top1=sum(p['selected_action']==p['teacher_action'] for p in subset)/len(subset),
                            teacher_mse=sum((p['value']-p['teacher_z'])**2 for p in subset)/len(subset),
                            factual_mse=sum((p['value']-p['factual_z'])**2 for p in subset)/len(subset))
                assert all(math.isclose(v,aggregate[k],rel_tol=1e-6,abs_tol=1e-6) for k,v in values.items())
                checked+=1
    gates={}
    for split in ('selection','confirmation'):
        a=result['final']['factual'][split]
        b=result['final']['teacher'][split]
        gates[split]=all(y['teacher_mse']<x['teacher_mse'] and y['teacher_ce']<=x['teacher_ce'] and y['top1']>=x['top1']
                         for x,y in [(a['overall'],b['overall'])]+[(a['stages'][str(s)],b['stages'][str(s)]) for s in (5,13,21)])
        assert gates[split]==result['gates'][split]['passed']
    assert all(gates.values())==result['mechanism_gate_passed']
    frozen=ROOT/'.selfplay/diagnostic-target-semantics-20261026/checkpoint.pt'
    original=load_checkpoint(frozen)
    assert sha(frozen)==result['frozen_sha256']
    for arm in ('factual','teacher'):
        saved=torch.load(DIRECTORY/f'{arm}-copy.pt',weights_only=True)
        assert saved['initial_sha256']==sha(frozen) and saved['signature']==result['signature']
        assert saved['optimizer']['param_groups']==original['optimizer']['param_groups']
        for key,state in original['optimizer']['state'].items():
            assert float(saved['optimizer']['state'][key]['step'])==float(state['step'])+32
        assert all(torch.isfinite(t).all() for t in saved['model'].values())
    summary=dict(input_sha256=sha(path),dataset_sha256=sha(ROOT/'gto_teacher_target_dataset_20261026.json'),
                 metric_groups_checked=checked,gates=gates,optimizer_steps_increment=32,adopted=False)
    save(ROOT/'gto_teacher_target_fit_verification_20261026.json',summary)
    print(json.dumps(summary))


if __name__=='__main__':
    run()
