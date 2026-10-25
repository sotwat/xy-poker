"""Near-terminal frozen value ranking versus fixed A9 continuations."""
import json
import time
from pathlib import Path

import numpy as np
import torch

from audit_value_search import digest
from environment import Bridge, XYState, features, resample
from train import PolicyValue, load_checkpoint, paired_state

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'gto_leaf_rank_20261025.json'


def run():
    torch.set_num_threads(1)
    deadline = time.monotonic() + 1200
    sources = json.loads((ROOT / '.selfplay/diagnostic-leaf-rank-20261025/sources.json').read_text())
    saved = load_checkpoint(ROOT / '.selfplay/final-verification/a9-milestones/games-00012000/model.pt')
    model = PolicyValue(saved['config']['width']).eval()
    model.load_state_dict(saved['model'])
    result = dict(complete=False, source=sources, model_sha256=saved['model_sha256'], rows=[],
                  plan=dict(prefix=29, bank_seeds=[0x71132, 0x81132], worlds_per_bank=8,
                            candidates='two highest legal policy logits plus default A9 root action',
                            scope='Post-training diagnostic roots; not independent strength data',
                            calibration_fitted=False, search_simulations=0))
    with Bridge() as bridge:
        for index, record in enumerate(sources):
            match = record['match']
            seed = match['seed']
            for mirror in (False, True):
                state = paired_state(bridge, seed, bool(match['swap']) ^ mirror)
                for action in match['actions'][:29]:
                    state.apply_action(action)
                assert not state.is_terminal()
                player = state.current_player()
                legal = state.legal_actions()
                with torch.no_grad():
                    logits, _ = model(torch.from_numpy(features(state.data, player)))
                top = sorted(legal, key=lambda a: (-float(logits[a]), a))[:2]
                teacher = bridge.call('baseline', state=state.data, baseline='a9', seed=seed ^ 0x512)
                candidates = sorted(set(top + [teacher]))
                row = dict(group='selection' if index < 2 else 'confirmation', seed=seed,
                           swap=bool(match['swap']) ^ mirror, prefix=match['actions'][:29],
                           root=state.data, player=player, teacher=teacher, top_policy=top, banks=[])
                for bank_seed in result['plan']['bank_seeds']:
                    rng = np.random.RandomState(seed ^ bank_seed)
                    worlds = [resample(state.data, player, rng) for _ in range(8)]
                    bank = dict(seed=bank_seed, world_pool_sha256=digest(worlds), samples=[])
                    for world_index, world in enumerate(worlds):
                        assert XYState(bridge, world).observation_string() == state.observation_string()
                        for action in candidates:
                            if time.monotonic() > deadline:
                                raise TimeoutError('Diagnostic deadline reached')
                            leaf = XYState(bridge, world).clone()
                            leaf.apply_action(action)
                            assert not leaf.is_terminal() and leaf.current_player() == 1 - player
                            with torch.no_grad():
                                _, raw = model(torch.from_numpy(features(leaf.data, leaf.current_player())))
                            predicted = -float(raw)
                            final_action = bridge.call('baseline', state=leaf.data, baseline='a9',
                                                       seed=seed + world_index + bank_seed)
                            leaf.apply_action(final_action)
                            assert leaf.is_terminal()
                            bank['samples'].append(dict(world=world_index, action=action,
                                                        predicted=predicted, final_action=final_action,
                                                        utility=float(leaf.returns()[player]), final=leaf.data))
                    row['banks'].append(bank)
                result['rows'].append(row)
                OUT.write_text(json.dumps(result, indent=2) + '\n')
                print(json.dumps(dict(seed=seed, mirror=mirror, candidates=candidates)), flush=True)
    result['complete'] = True
    OUT.write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    run()
