"""Paired late-game search ablation; never updates a training checkpoint."""
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import torch
from open_spiel.python.algorithms import ismcts

from environment import Bridge, XYState, resample
from train import Evaluator, PolicyValue, load_checkpoint, paired_state

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'gto_value_search_20261025.json'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


class NeutralValue(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, x):
        logits, value = self.model(x)
        return logits, torch.zeros_like(value)


class FixedWorldBot(ismcts.ISMCTSBot):
    def sample_root_state(self, state):
        sampled = self.worlds[self.world_index % len(self.worlds)].clone()
        self.world_index += 1
        assert sampled.observation_string() == state.observation_string()
        return sampled


def search(state, model, worlds, seed, deadline):
    def check():
        if time.monotonic() > deadline:
            raise TimeoutError('Diagnostic wall-clock limit reached')
    rng = np.random.RandomState(seed)
    evaluator = Evaluator(model, check, rng)
    bot = FixedWorldBot(state.get_game(), evaluator, uct_c=1.5,
                       max_simulations=128, random_state=rng, max_world_samples=8,
                       use_observation_string=True, allow_inconsistent_action_sets=False,
                       final_policy_type=ismcts.ISMCTSFinalPolicyType.NORMALIZED_VISITED_COUNT,
                       child_selection_policy=ismcts.ChildSelectionPolicy.PUCT)
    bot.worlds, bot.world_index = worlds, 0
    policy = sorted(bot.run_search(state))
    assert bot.world_index == 128
    assert np.isclose(sum(p for _, p in policy), 1)
    assert all(a in state.legal_actions() and p >= 0 for a, p in policy)
    action = min(policy, key=lambda item: (-item[1], item[0]))[0]
    return dict(action=int(action), policy=policy, value=evaluator.infer(state)[2],
                world_visits=bot.world_index)


def run():
    torch.set_num_threads(1)
    deadline = time.monotonic() + 1200
    path = ROOT / '.selfplay/final-verification/a9-milestones/games-00012000/model.pt'
    saved = load_checkpoint(path)
    model = PolicyValue(saved['config']['width']).eval()
    model.load_state_dict(saved['model'])
    neutral = NeutralValue(model).eval()
    result = dict(model_sha256=saved['model_sha256'], rows=[], complete=False,
                  plan=dict(selection=[100525001, 100525002], confirmation=[100525101, 100525102],
                            swaps=[False, True], prefix_actions=24, simulations=128, worlds=8,
                            gate='No negative root utility delta and at least one positive in EACH group; diagnostic only',
                            continuation='A9 default for both seats after the selected root action',
                            scope='Late A7-reachable roots, balanced fixed world schedule; not full-game strength'))
    with Bridge() as bridge:
        for group in ('selection', 'confirmation'):
            for seed in result['plan'][group]:
                for swap in (False, True):
                    state = paired_state(bridge, seed, swap)
                    prefix = []
                    for ply in range(24):
                        assert not state.is_terminal()
                        action = bridge.call('baseline', state=state.data, baseline='a7', seed=seed + ply)
                        prefix.append(action)
                        state.apply_action(action)
                    assert not state.is_terminal()
                    player = state.current_player()
                    rng = np.random.RandomState(seed ^ 0x7812)
                    worlds = [XYState(bridge, resample(state.data, player, rng)) for _ in range(8)]
                    for world in worlds:
                        assert world.observation_string() == state.observation_string()
                    with torch.no_grad():
                        from environment import features
                        x = torch.from_numpy(features(state.data, player))
                        assert torch.equal(model(x)[0], neutral(x)[0])
                    arms = {name: search(state, network, worlds, seed ^ 0x1298, deadline)
                            for name, network in (('original', model), ('zero', neutral))}
                    teacher = bridge.call('baseline', state=state.data, baseline='a9', seed=seed ^ 0x913)
                    outcomes = {}
                    for action in sorted({teacher, *(arm['action'] for arm in arms.values())}):
                        trial = state.clone()
                        trial.apply_action(action)
                        moves = [action]
                        while not trial.is_terminal():
                            if time.monotonic() > deadline:
                                raise TimeoutError('Diagnostic wall-clock limit reached')
                            chosen = bridge.call('baseline', state=trial.data, baseline='a9',
                                                 seed=seed + 1000 + len(moves))
                            trial.apply_action(chosen)
                            moves.append(chosen)
                        outcomes[str(action)] = dict(moves=moves, utility=float(trial.returns()[player]),
                                                     final=trial.data)
                    delta = (outcomes[str(arms['zero']['action'])]['utility'] -
                             outcomes[str(arms['original']['action'])]['utility'])
                    result['rows'].append(dict(group=group, seed=seed, swap=swap, player=player,
                                               prefix=prefix, root=state.data, arms=arms, teacher=teacher,
                                               world_pool_sha256=digest([w.data for w in worlds]),
                                               outcomes=outcomes, utility_delta=delta))
                    OUT.write_text(json.dumps(result, indent=2) + '\n')
                    print(json.dumps(dict(group=group, seed=seed, swap=swap, delta=delta)), flush=True)
    result['complete'] = True
    result['gate_passed'] = all(
        min(r['utility_delta'] for r in result['rows'] if r['group'] == group) >= 0 and
        max(r['utility_delta'] for r in result['rows'] if r['group'] == group) > 0
        for group in ('selection', 'confirmation'))
    OUT.write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    run()
