"""Keep prior seed-manifest bytes immutable after the research ledger advances."""
import json
import shutil
from pathlib import Path

from collect_teacher_targets_20261026 import (DIRECTORY, PLAN_PATH, ROOT, digest, generated_hashes,
    rules_digest, save, sha, signature, validate_resume)


def freeze():
    manifest=json.loads((DIRECTORY/'manifest.json').read_text())
    assert manifest['complete']
    validate_resume(manifest)
    directory=DIRECTORY/'prior-inputs'
    directory.mkdir(exist_ok=True)
    for index,item in enumerate(manifest['forbidden']['files']):
        path=directory/f'{index:03d}-{Path(item["path"]).name}'
        if not path.exists(): shutil.copyfile(ROOT/item['path'],path)
        assert sha(path)==item['sha256']
    save(directory/'index.json',manifest['forbidden']['files'])


def validate_finished(manifest):
    assert manifest['complete'] and manifest['signature']==signature(manifest)
    assert manifest['plan_sha256']==sha(PLAN_PATH)
    plan=json.loads(PLAN_PATH.read_text())
    assert manifest['frozen_sha256']==sha(ROOT/plan['source_rule']['frozen_checkpoint'])==plan['source_rule']['frozen_checkpoint_sha256']
    assert manifest['rules_sha256']==rules_digest()
    assert manifest['collector_sha256']==sha(ROOT/'selfplay/collect_teacher_targets_20261026.py')
    assert manifest['probe_sha256']==sha(ROOT/'selfplay/diagnostic_probe.py')
    assert manifest['teacher_sha256']==sha(ROOT/'scripts/audit_bounded_a9_20261025.ts')
    assert manifest['generated_hashes']==generated_hashes()
    assert manifest['source_sha256']==digest(manifest['source'])
    assert manifest['forbidden_sha256']==digest(manifest['forbidden'])
    assert not {e['match']['seed'] for e in manifest['source']}&set(manifest['forbidden']['seeds'])
    directory=DIRECTORY/'prior-inputs'
    assert json.loads((directory/'index.json').read_text())==manifest['forbidden']['files']
    for index,item in enumerate(manifest['forbidden']['files']):
        assert sha(directory/f'{index:03d}-{Path(item["path"]).name}')==item['sha256']


if __name__=='__main__':
    freeze()
    validate_finished(json.loads((DIRECTORY/'manifest.json').read_text()))
