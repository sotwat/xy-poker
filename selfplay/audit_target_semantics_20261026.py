"""Stratify logged policy supervision and executed-policy outcomes; no fitting."""
import collections
from contextlib import ExitStack
import fcntl
import hashlib
import json
from pathlib import Path
import time

import numpy as np
import torch

from audit_teacher_path_20261025 import decoded_mask
from environment import Bridge, features
from train import load_checkpoint, paired_state

ROOT = Path(__file__).resolve().parents[1]
PLAN = dict(source_floor=14600, games_per_kind=16,
            kinds=['self', 'teacher-selfplay', 'baseline', 'past-model'],
            rule='first complete available 16 games per kind at or after floor; outcome blind',
            split='per-kind chronological indices mod4==3 are confirmation; others selection',
            metrics='by split/source/stage: target expected executed-action mass, argmax agreement, logged z, game/actor clusters',
            stage='move index 0..10 early,11..20 middle,21..30 late',
            interpretation='logged z belongs to executed trajectory, not a counterfactual teacher continuation; no adoption or causal/strength claim')


def run():
    torch.set_num_threads(1)
    live = ROOT/'.selfplay/final-verification'
    assert (live/'stop.flag').exists()
    with ExitStack() as stack:
        for name in ['supervisor.lock', 'run.lock']:
            f = stack.enter_context((live/name).open('a+'))
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = hashlib.sha256((live/'latest.pt').read_bytes()).hexdigest()
        saved = load_checkpoint(live/'latest.pt')
        events = [json.loads(x) for x in (live/'events.jsonl').read_text().splitlines()]
        events = [e for e in events if e.get('event') == 'selfplay' and e['total_games'] <= saved['total_games']]
        cursor, available = len(saved['replay']), []
        for event in reversed(events):
            start = cursor-event['samples']
            if start < 0:
                break
            available.append((event, saved['replay'][start:cursor]))
            cursor = start
        quota, chosen = collections.Counter(), []
        for event, rows in reversed(available):
            kind = event['opponent']
            if event['total_games'] >= PLAN['source_floor'] and kind in PLAN['kinds'] and quota[kind] < 16:
                split = 'confirmation' if quota[kind] % 4 == 3 else 'selection'
                chosen.append((event, rows, split))
                quota[kind] += 1
        assert dict(quota) == {k:16 for k in PLAN['kinds']}
        assert len({e['match']['seed'] for e, _, _ in chosen}) == 64
        directory = ROOT/'.selfplay/diagnostic-target-semantics-20261026'
        directory.mkdir(exist_ok=False)
        (directory/'checkpoint.pt').write_bytes((live/'latest.pt').read_bytes())
        assert hashlib.sha256((directory/'checkpoint.pt').read_bytes()).hexdigest() == before
        (directory/'events.json').write_text(json.dumps([e for e, _, _ in chosen]))
        result = dict(plan=PLAN, live_before=before, checkpoint_games=saved['total_games'],
                      manifest=[dict(total_games=e['total_games'], seed=e['match']['seed'], kind=e['opponent'], model_seat=e['match']['model_seat'], split=split) for e, _, split in chosen],
                      rows=[], complete=False, new_teacher_calls=0, training_updates=0)
        output = ROOT/'gto_target_semantics_20261026.json'
        output.write_text(json.dumps(result, indent=2)+'\n')
        wall, mono = time.time()+1200, time.monotonic()+1200
        with Bridge() as bridge:
            for event, rows, split in chosen:
                m=event['match']
                state=paired_state(bridge,m['seed'],m['swap'])
                # Past-opponent rows are intentionally omitted from the training replay.
                sample_index=0
                for move,action in enumerate(m['actions']):
                    assert time.time()<wall and time.monotonic()<mono
                    actor=state.current_player()
                    include=event['opponent']!='past-model' or actor==m['model_seat']
                    if include:
                        row=rows[sample_index];sample_index+=1
                        assert np.array_equal(row['x'].numpy(),features(state.data,actor))
                        assert torch.equal(decoded_mask(row['x']),row['mask'])
                        assert row['z']==m['returns'][actor]
                        target=int(row['pi'].argmax())
                        teacher=row['source'].startswith('teacher-')
                        if teacher:
                            assert float(row['pi'][target])==1 and float(row['pi'].sum())==1
                        if row['source'] in ['teacher-a9','teacher-a9-selfplay']:
                            assert target==action
                        result['rows'].append(dict(seed=m['seed'],game=event['total_games'],actor=actor,kind=event['opponent'],
                                                   split=split,move=move,stage='early' if move<=10 else 'middle' if move<=20 else 'late',
                                                   source=row['source'],executed=action,target=target,teacher=teacher,
                                                   executed_target_mass=float(row['pi'][action]),z=row['z']))
                    state.apply_action(action)
                assert sample_index==len(rows) and state.is_terminal()
                assert list(state.returns())==m['returns'] and [p['score'] for p in state.data['players']]==m['scores']
        result['complete']=True
        result['live_after']=hashlib.sha256((live/'latest.pt').read_bytes()).hexdigest()
        assert result['live_after']==before
        output.write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(dict(games=saved['total_games'],rows=len(result['rows']),hash=before)))


if __name__=='__main__':
    run()
