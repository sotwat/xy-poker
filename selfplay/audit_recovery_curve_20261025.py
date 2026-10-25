"""A9 takeover at fixed cutoffs on preselected saved learner trajectories."""
import hashlib
import json
import time
from pathlib import Path

from environment import Bridge
from train import paired_state

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'gto_recovery_curve_20261025.json'
CUTOFFS = (0, 1, 9, 17, 25)


def run():
    deadline = time.monotonic() + 1200
    source = ROOT / '.selfplay/diagnostic-recovery-20261025/sources.json'
    sources = (json.loads(source.read_text()) if source.exists()
               else json.loads(OUT.read_text())['source'])
    result = dict(complete=False, source=sources, rows=[],
                  plan=dict(cutoffs=CUTOFFS, baseline='a9', samples=64, milliseconds=1000,
                            initial_seed_xor=0x6261, seed_rule='(deal ^ 0x6261) + absolute action index',
                            scope='Correlated learner self-play prefixes; A9 both seats thereafter; no learned model strength test'))
    OUT.write_text(json.dumps(result, indent=2) + '\n')
    with Bridge() as bridge:
        for index, record in enumerate(sources):
            match = record['match']
            seed = match['seed']
            for mirror in (False, True):
                swap = bool(match['swap']) ^ mirror
                source_player = int(mirror)
                for cutoff in CUTOFFS:
                    state = paired_state(bridge, seed, swap)
                    for action in match['actions'][:cutoff]:
                        state.apply_action(action)
                    root = state.data
                    moves, seeds = [], []
                    start = time.monotonic()
                    while not state.is_terminal():
                        if time.monotonic() > deadline:
                            raise TimeoutError('Recovery diagnostic deadline reached')
                        action_seed = (seed ^ 0x6261) + cutoff + len(moves)
                        chosen = bridge.call('baseline', state=state.data, baseline='a9', seed=action_seed)
                        state.apply_action(chosen)
                        moves.append(chosen)
                        seeds.append(action_seed)
                    scores = [p['score'] for p in state.data['players']]
                    row = dict(group='selection' if index < 2 else 'confirmation', seed=seed,
                               mirror=mirror, swap=swap, source_player=source_player, cutoff=cutoff,
                               prefix=match['actions'][:cutoff], root=root, moves=moves,
                               continuation_seeds=seeds, final=state.data,
                               utility=state.returns()[source_player],
                               score_margin=scores[source_player] - scores[1-source_player],
                               elapsed_seconds=time.monotonic()-start)
                    result['rows'].append(row)
                    OUT.write_text(json.dumps(result, indent=2) + '\n')
                    print(json.dumps({k: row[k] for k in ('seed', 'mirror', 'cutoff', 'utility', 'score_margin')}), flush=True)
    result['complete'] = True
    result['result_sha256_without_hash'] = hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()
    OUT.write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    run()
