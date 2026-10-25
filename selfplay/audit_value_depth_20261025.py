"""Frozen search depth/value-scale diagnostic on saved learner trajectories."""
import json
import time
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from open_spiel.python.algorithms import ismcts

from audit_value_search import FixedWorldBot, digest
from environment import Bridge, XYState, features, resample
from train import Evaluator, PolicyValue, load_checkpoint, paired_state

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'gto_search_depth_20261025.json'


def occupied(state):
    return sum(c is not None for p in state.data['players'] for row in p['board'] for c in row)


class ScaleValue(torch.nn.Module):
    def __init__(self, model, scale):
        super().__init__()
        self.model, self.scale = model, scale

    def forward(self, x):
        logits, value = self.model(x)
        return logits, value * self.scale


class DepthEvaluator(Evaluator):
    def evaluate(self, state):
        self.depths[occupied(state) - self.root_occupied] += 1
        return super().evaluate(state)


class DepthBot(FixedWorldBot):
    def run_simulation(self, state):
        if state.is_terminal():
            self.terminal_leaves += 1
        return super().run_simulation(state)


def search(state, model, worlds, seed, simulations, deadline):
    def check():
        if time.monotonic() > deadline:
            raise TimeoutError('Diagnostic limit reached')
    rng = np.random.RandomState(seed)
    evaluator = DepthEvaluator(model, check, rng)
    evaluator.root_occupied, evaluator.depths = occupied(state), Counter()
    bot = DepthBot(state.get_game(), evaluator, uct_c=1.5,
                   max_simulations=simulations, random_state=rng, max_world_samples=8,
                   use_observation_string=True, allow_inconsistent_action_sets=False,
                   final_policy_type=ismcts.ISMCTSFinalPolicyType.NORMALIZED_VISITED_COUNT,
                   child_selection_policy=ismcts.ChildSelectionPolicy.PUCT)
    bot.worlds, bot.world_index, bot.terminal_leaves = worlds, 0, 0
    policy = sorted(bot.run_search(state))
    assert bot.world_index == simulations
    assert sum(evaluator.depths.values()) + bot.terminal_leaves == simulations
    assert np.isclose(sum(p for _, p in policy), 1)
    assert all(a in state.legal_actions() and p >= 0 for a, p in policy)
    action = min(policy, key=lambda item: (-item[1], item[0]))[0]
    return dict(action=int(action), policy=policy, leaf_depth_histogram=dict(evaluator.depths),
                terminal_leaves=bot.terminal_leaves, simulations=simulations)


def run():
    torch.set_num_threads(1)
    deadline = time.monotonic() + 1200
    source = ROOT / '.selfplay/diagnostic-depth-20261025/roots-source.json'
    rows = json.loads(source.read_text())
    saved = load_checkpoint(ROOT / '.selfplay/final-verification/a9-milestones/games-00012000/model.pt')
    model = PolicyValue(saved['config']['width']).eval()
    model.load_state_dict(saved['model'])
    result = dict(complete=False, model_sha256=saved['model_sha256'], source=rows, rows=[],
                  scope='Saved training trajectories, held separate diagnostic roots; not independent strength tests',
                  settings=dict(prefix_actions=24, worlds=8, arms={'original128': [1, 128],
                                'quarter128': [.25, 128], 'original512': [1, 512]}))
    with Bridge() as bridge:
        for index, record in enumerate(rows):
            match = record['match']
            seed = match['seed']
            for mirror in (False, True):
                state = paired_state(bridge, seed, bool(match['swap']) ^ mirror)
                for action in match['actions'][:24]:
                    state.apply_action(action)
                assert not state.is_terminal()
                player = state.current_player()
                rng = np.random.RandomState(seed ^ 0x8291)
                worlds = [XYState(bridge, resample(state.data, player, rng)) for _ in range(8)]
                arms = {}
                for name, (scale, simulations) in result['settings']['arms'].items():
                    network = ScaleValue(model, scale).eval()
                    with torch.no_grad():
                        x = torch.from_numpy(features(state.data, player))
                        assert torch.equal(model(x)[0], network(x)[0])
                    arms[name] = search(state, network, worlds, seed ^ 0x9132, simulations, deadline)
                teacher = bridge.call('baseline', state=state.data, baseline='a9', seed=seed ^ 0x7112)
                outcomes = {}
                for action in sorted({teacher, *(arm['action'] for arm in arms.values())}):
                    trial = state.clone()
                    trial.apply_action(action)
                    moves = [action]
                    while not trial.is_terminal():
                        if time.monotonic() > deadline:
                            raise TimeoutError('Diagnostic limit reached')
                        a = bridge.call('baseline', state=trial.data, baseline='a9', seed=seed + len(moves) + 2000)
                        trial.apply_action(a)
                        moves.append(a)
                    outcomes[str(action)] = dict(moves=moves, utility=float(trial.returns()[player]), final=trial.data)
                result['rows'].append(dict(group='selection' if index < 2 else 'confirmation',
                                           seed=seed, swap=bool(match['swap']) ^ mirror,
                                           prefix=match['actions'][:24], root=state.data, player=player,
                                           world_pool_sha256=digest([w.data for w in worlds]),
                                           arms=arms, teacher=teacher, outcomes=outcomes))
                OUT.write_text(json.dumps(result, indent=2) + '\n')
                print(json.dumps(dict(seed=seed, mirror=mirror,
                                     terminals={k: v['terminal_leaves'] for k, v in arms.items()})), flush=True)
    result['complete'] = True
    OUT.write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    run()
