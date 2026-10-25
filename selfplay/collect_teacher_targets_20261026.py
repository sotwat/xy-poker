"""Resumable collection for the immutable ledger87 protocol; no model updates."""
import argparse
import copy
import fcntl
import hashlib
import json
import re
import subprocess
import time
from contextlib import ExitStack
from pathlib import Path

import numpy as np
import torch

from audit_teacher_path_20261025 import decoded_mask
from audit_terminal_prior_20261025 import COMMAND
from diagnostic_probe import DiagnosticProbe
from environment import ACTIONS, CARD_INDEX, Bridge, features, rules_digest
from train import paired_state

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / '.selfplay/final-verification'
DIRECTORY = ROOT / '.selfplay/diagnostic-teacher-target-20261026'
PLAN_PATH = ROOT / 'gto_teacher_target_plan_20261026.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def save(path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.replace(path)


class Deadline:
    def __init__(self, seconds=1200):
        self.wall = time.time() + seconds
        self.mono = time.monotonic() + seconds

    def remaining(self):
        remaining = min(self.wall - time.time(), self.mono - time.monotonic())
        if remaining <= 0:
            raise TimeoutError('Teacher target chunk deadline')
        return remaining


def choose_sources(events):
    chosen, screened, seen = [], [], set()
    for event in events:
        if event.get('event') != 'selfplay' or event.get('opponent') != 'baseline' or event['total_games'] < 15600:
            continue
        match = event['match']
        seed = match['seed']
        assert seed not in seen, 'Duplicate source seed; do not silently skip'
        seen.add(seed)
        assert len(match['actions']) == 31 and len(match['returns']) == 2
        assert match['model_seat'] in (0, 1)
        screened.append(dict(total_games=event['total_games'], seed=seed, accepted=True))
        chosen.append(event)
        if len(chosen) == 32:
            assert [e['total_games'] for e in chosen] == sorted(e['total_games'] for e in chosen)
            return chosen, screened
    raise ValueError('Need first32 complete baseline games at/after15600; no substitution')


def forbidden_inventory():
    paths = subprocess.check_output(['git', 'ls-files', '--', 'gto_*.json', 'GTO_*.md'], cwd=ROOT, text=True).splitlines()
    inventory, seeds = [], set()

    def visit(value, key=''):
        if isinstance(value, dict):
            for k, v in value.items():
                visit(v, k)
        elif isinstance(value, list):
            for item in value:
                visit(item, key)
        elif 'seed' in key.lower() and isinstance(value, int) and not isinstance(value, bool):
            seeds.add(value)

    for relative in sorted(paths):
        if relative.startswith(('gto_teacher_target_', 'GTO_TEACHER_TARGET_')):
            continue
        path = ROOT / relative
        inventory.append(dict(path=relative, sha256=sha(path)))
        if path.suffix == '.json':
            visit(json.loads(path.read_text()))
        else:
            seeds.update(map(int, re.findall(r'(?<![0-9a-fA-F])\d{9,10}(?![0-9a-fA-F])', path.read_text())))
    assert inventory and len(seeds) > 100
    return inventory, sorted(seeds)


def card_check(data):
    cards = [c['id'] for c in data['deck']]
    for player in data['players']:
        cards.extend(c['id'] for c in player['hand'])
        cards.extend(c['id'] for row in player['board'] for c in row if c)
    assert len(cards) == len(set(cards)) == 52 and set(cards) == set(CARD_INDEX)


def root_for(bridge, source, stage, mirror):
    match = source['match']
    actor = match['model_seat'] ^ int(mirror)
    state = paired_state(bridge, match['seed'], bool(match['swap']) ^ mirror)
    prefix = []
    while len(prefix) < stage or state.current_player() != actor:
        assert not state.is_terminal()
        action = match['actions'][len(prefix)]
        assert action in state.legal_actions()
        state.apply_action(action)
        prefix.append(action)
    assert state.current_player() == actor
    card_check(state.data)
    x = torch.from_numpy(features(state.data, actor))
    mask = torch.zeros(ACTIONS, dtype=torch.bool)
    mask[state.legal_actions()] = True
    assert torch.equal(mask, decoded_mask(x))
    return state, actor, prefix, x.tolist(), mask.tolist()


def generated_hashes():
    directory = ROOT / '.selfplay/bounded-proofs-20261025'
    paths = sorted(directory.glob('*.ts')) + sorted(directory.glob('*manifest.json'))
    assert len(paths) >= 10
    return {str(p.relative_to(ROOT)): sha(p) for p in paths}


def signature(manifest):
    return digest({k: manifest[k] for k in ('plan_sha256', 'frozen_sha256', 'rules_sha256', 'collector_sha256',
                                          'probe_sha256', 'teacher_sha256', 'generated_hashes', 'source_sha256', 'forbidden_sha256')})


def validate_resume(manifest):
    assert manifest['plan_sha256'] == sha(PLAN_PATH)
    plan = json.loads(PLAN_PATH.read_text())
    assert manifest['frozen_sha256'] == sha(ROOT / plan['source_rule']['frozen_checkpoint']) == plan['source_rule']['frozen_checkpoint_sha256']
    assert manifest['rules_sha256'] == rules_digest()
    assert manifest['collector_sha256'] == sha(Path(__file__))
    assert manifest['probe_sha256'] == sha(ROOT / 'selfplay/diagnostic_probe.py')
    assert manifest['teacher_sha256'] == sha(ROOT / 'scripts/audit_bounded_a9_20261025.ts')
    assert manifest['generated_hashes'] == generated_hashes()
    assert manifest['source_sha256'] == digest(manifest['source'])
    assert manifest['forbidden_sha256'] == digest(manifest['forbidden'])
    for item in manifest['forbidden']['files']:
        assert sha(ROOT / item['path']) == item['sha256'], f"Prior manifest changed: {item['path']}"
    assert not {e['match']['seed'] for e in manifest['source']} & set(manifest['forbidden']['seeds'])
    assert manifest['signature'] == signature(manifest)


def descriptors(manifest):
    for index, source in enumerate(manifest['source']):
        for stage in (5, 13, 21):
            for mirror in (False, True):
                yield dict(id=f'{index:02d}-{stage:02d}-{int(mirror)}', source_index=index,
                           group=('update', 'update', 'selection', 'confirmation')[index % 4],
                           seed=source['match']['seed'], stage=stage, mirror=mirror)


def validate_reply(reply, state):
    assert reply['action'] in state.legal_actions()
    assert reply['diagnostics']['completedBeliefSamples'] == 64
    assert not reply['diagnostics']['usedForcedWinContinuation']
    for proof in reply['proofs']:
        assert proof['used'] <= 1_000_000
        assert proof['status'] != 'incomplete' or not proof['hasResult']


def collect_root(bridge, probe, source, desc, deadline, path):
    state, actor, prefix, x, mask = root_for(bridge, source, desc['stage'], desc['mirror'])
    row = dict(**desc, complete=False, actor=actor, prefix=prefix, root=copy.deepcopy(state.data),
               x=x, mask=mask, factual_z=source['match']['returns'][source['match']['model_seat']],
               null=[], decisions=[], moves=[])

    def call(client, trial):
        remaining = deadline.remaining()
        client.timeout = min(90, remaining)
        request = dict(state=copy.deepcopy(trial.data), seed=(desc['seed'] ^ 0x102687) + len(prefix) + len(row['moves']), proofLimit=1_000_000)
        trace = dict(request=request, complete=False)
        row['active_call'] = trace
        save(path, row)
        reply = client.call(request)
        trace['reply'] = reply
        save(path, row)
        deadline.remaining()
        validate_reply(reply, trial)
        trace['complete'] = True
        return trace

    save(path, row)
    try:
        for _ in range(2):
            row['null'].append(call(probe, state))
            save(path, row)
        with DiagnosticProbe(COMMAND) as fresh:
            row['null'].append(call(fresh, state))
        assert len({t['reply']['action'] for t in row['null']}) == 1, 'Root null disagreement'
        row['teacher_action'] = row['null'][0]['reply']['action']
        while not state.is_terminal():
            deadline.remaining()
            trace = row['null'][0] if not row['moves'] else call(probe, state)
            action = trace['reply']['action']
            assert action in state.legal_actions()
            row['decisions'].append(trace)
            state.apply_action(action)
            row['moves'].append(action)
            card_check(state.data)
            save(path, row)
        row.update(complete=True, final=state.data, teacher_z=float(state.returns()[actor]),
                   scores=[p['score'] for p in state.data['players']])
        row.pop('active_call', None)
        deadline.remaining()
    except Exception as error:
        row['failure'] = dict(type=type(error).__name__, message=str(error))
        raise
    finally:
        save(path, row)
    return row


def run():
    assert (LIVE / 'stop.flag').exists(), 'Normal saved stop required'
    assert Path('/usr/bin/nice').exists()
    assert __import__('os').getpriority(__import__('os').PRIO_PROCESS, 0) >= 15
    DIRECTORY.mkdir(exist_ok=True)
    manifest_path = DIRECTORY / 'manifest.json'
    with ExitStack() as stack:
        for name in ('supervisor.lock', 'run.lock'):
            handle = stack.enter_context((LIVE / name).open('a+'))
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = sha(LIVE / 'latest.pt')
        deadline = Deadline()
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text())
            validate_resume(manifest)
            assert not manifest.get('complete'), 'Collection already complete'
            assert not manifest.get('fatal_failure'), 'Investigate failure before resuming'
        else:
            events = [json.loads(line) for line in (LIVE / 'events.jsonl').read_text().splitlines()]
            sources, screening = choose_sources(events)
            files, seeds = forbidden_inventory()
            assert not {e['match']['seed'] for e in sources} & set(seeds), 'Previous evaluation/diagnostic seed overlap'
            plan = json.loads(PLAN_PATH.read_text())
            manifest = dict(complete=False, source=sources, screening=screening, completed={}, chunks=[],
                            forbidden=dict(files=files, seeds=seeds), plan_sha256=sha(PLAN_PATH),
                            frozen_sha256=sha(ROOT / plan['source_rule']['frozen_checkpoint']), rules_sha256=rules_digest(),
                            collector_sha256=sha(Path(__file__)), probe_sha256=sha(ROOT / 'selfplay/diagnostic_probe.py'),
                            teacher_sha256=sha(ROOT / 'scripts/audit_bounded_a9_20261025.ts'), generated_hashes=generated_hashes(),
                            source_sha256=digest(sources), forbidden_sha256=digest(dict(files=files, seeds=seeds)))
            manifest['signature'] = signature(manifest)
            validate_resume(manifest)
            save(manifest_path, manifest)
        chunk = dict(started_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), before_sha256=before,
                     initial_completed=len(manifest['completed']))
        manifest['chunks'].append(chunk)
        save(manifest_path, manifest)
        try:
            with Bridge() as bridge, DiagnosticProbe(COMMAND) as probe:
                for source in manifest['source']:
                    deadline.remaining()
                    match = source['match']
                    original = paired_state(bridge, match['seed'], match['swap'])
                    for action in match['actions']:
                        card_check(original.data)
                        original.apply_action(action)
                    card_check(original.data)
                    assert original.is_terminal() and list(original.returns()) == match['returns']
                    assert [p['score'] for p in original.data['players']] == match['scores']
                for desc in descriptors(manifest):
                    path = DIRECTORY / (desc['id'] + '.json')
                    if desc['id'] in manifest['completed']:
                        assert sha(path) == manifest['completed'][desc['id']]
                        assert json.loads(path.read_text())['complete']
                        continue
                    if path.exists():
                        # Retain all interrupted evidence; recompute only the uncommitted root.
                        old = json.loads(path.read_text())
                        save(DIRECTORY / f"{desc['id']}.attempt-{len(manifest['chunks']):03d}.json", old)
                    collect_root(bridge, probe, manifest['source'][desc['source_index']], desc, deadline, path)
                    manifest['completed'][desc['id']] = sha(path)
                    save(manifest_path, manifest)
                    print(json.dumps(dict(completed=len(manifest['completed']), root=desc['id'])), flush=True)
            manifest['complete'] = len(manifest['completed']) == 192
        except TimeoutError as error:
            chunk['timeout'] = str(error)
        except Exception as error:
            manifest['fatal_failure'] = dict(type=type(error).__name__, message=str(error))
            raise
        finally:
            chunk.update(after_sha256=sha(LIVE / 'latest.pt'), final_completed=len(manifest['completed']),
                         finished_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                         remaining_wall=deadline.wall-time.time(), remaining_monotonic=deadline.mono-time.monotonic())
            save(manifest_path, manifest)
            assert chunk['after_sha256'] == before


if __name__ == '__main__':
    argparse.ArgumentParser(description=__doc__).parse_args()
    run()
