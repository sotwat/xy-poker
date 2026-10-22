"""Bounded diagnostic of actual IS-MCTS leaves; does not update a checkpoint."""
import argparse
import json
from pathlib import Path
from unittest.mock import patch
import numpy as np
import torch
from environment import Bridge, XYState
from train import Evaluator, PolicyValue, load_checkpoint, paired_state, search

p = argparse.ArgumentParser()
p.add_argument('--checkpoint', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--worlds', type=int, default=8)
a = p.parse_args()
torch.set_num_threads(2)
saved = load_checkpoint(a.checkpoint)
model = PolicyValue(saved['config']['width']).eval()
model.load_state_dict(saved['model'])
rows = []
with Bridge() as bridge:
    for seed in (100523101, 100523102):
        state = paired_state(bridge, seed)
        for ply in range(30):
            if ply in (1, 6, 14, 22, 28, 29):
                leaves, terminals = [], []
                root_turn = state.data['turnCount']
                infer = Evaluator.evaluate
                returns = XYState.returns
                def leaf(evaluator, node):
                    leaves.append(node.data['turnCount'] - root_turn)
                    return infer(evaluator, node)
                def terminal(node):
                    terminals.append(node.data['turnCount'] - root_turn)
                    return returns(node)
                with patch.object(Evaluator, 'evaluate', leaf), patch.object(XYState, 'returns', terminal):
                    pi = search(state, model, 128, np.random.RandomState(seed + ply), world_samples=a.worlds)
                rows.append(dict(seed=seed, ply=ply, legal=len(state.legal_actions()),
                                 terminal_leaves=len(terminals), neural_leaves=len(leaves),
                                 max_neural_depth=max(leaves), mean_neural_depth=float(np.mean(leaves)),
                                 policy_max=float(pi.max())))
            state.apply_action(state.legal_actions()[0])
a.output.write_text(json.dumps(dict(model_sha256=saved['model_sha256'], simulations=128,
                                   world_samples=a.worlds,
                                   purpose='diagnostic only; first-legal trajectory', rows=rows), indent=2)+'\n')
print(json.dumps(rows))
