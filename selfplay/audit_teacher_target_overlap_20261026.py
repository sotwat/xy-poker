"""Conservative seed exclusion across all three existing XY research checkouts."""
import json
import re
from pathlib import Path

from collect_teacher_targets_20261026 import DIRECTORY, ROOT, digest, save, sha


def run():
    manifest=json.loads((DIRECTORY/'manifest.json').read_text())
    checkouts=[ROOT,Path('/Users/aaa/Documents/ChatGPT/XYポーカー'),
               Path('/Users/aaa/.codex/worktrees/xy-profile-stages/XYポーカー')]
    all_seeds,inventory=set(),[]
    def visit(value,key=''):
        if isinstance(value,dict):
            for k,v in value.items(): visit(v,k)
        elif isinstance(value,list):
            for v in value: visit(v,key)
        elif 'seed' in key.lower() and isinstance(value,int) and not isinstance(value,bool):
            all_seeds.add(value)
    for checkout in checkouts:
        assert checkout.exists()
        for path in sorted([*checkout.glob('gto_*.json'),*checkout.glob('GTO_*.md')]):
            if path.name.startswith(('gto_teacher_target_','GTO_TEACHER_TARGET_')):
                continue
            raw=path.read_bytes()
            inventory.append(dict(checkout=str(checkout),path=path.name,sha256=sha(path)))
            if path.suffix=='.json': visit(json.loads(raw))
            else: all_seeds.update(map(int,re.findall(r'(?<![0-9a-fA-F])\d{9,10}(?![0-9a-fA-F])',raw.decode())))
    sources={e['match']['seed'] for e in manifest['source']}
    overlap=sorted(sources&all_seeds)
    result=dict(source_sha256=manifest['source_sha256'],signature=manifest['signature'],
                passed=not overlap,overlap=overlap,source_seeds=sorted(sources),prior_seeds=sorted(all_seeds),
                inventory=inventory,inventory_sha256=digest(inventory),
                scope='Conservative exclusion from all root-level GTO result/plan/report files, including untracked historical work; no files modified')
    save(ROOT/'gto_teacher_target_overlap_20261026.json',result)
    assert not overlap, f'Previous evaluation/diagnostic seed overlap: {overlap}'
    print(json.dumps(dict(files=len(inventory),prior_seeds=len(all_seeds),sources=len(sources),overlap=overlap)))


if __name__=='__main__':
    run()
