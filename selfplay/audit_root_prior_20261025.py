"""Common-world search with frozen values and alternative root priors."""
import json
import time
from pathlib import Path

import numpy as np
import torch
from open_spiel.python.algorithms import ismcts

from audit_value_search import FixedWorldBot, digest
from environment import Bridge, XYState, resample
from train import Evaluator, PolicyValue, load_checkpoint, paired_state

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'gto_root_prior_20261025.json'


class RootPriorEvaluator(Evaluator):
    def prior(self, state):
        original = super().prior(state)
        if state.observation_string() != self.root_observation or self.mode == 'learned':
            return original
        legal = [a for a, _ in original]
        if self.mode == 'uniform':
            return [(a, 1 / len(legal)) for a in legal]
        assert self.mode == 'teacher50' and self.teacher in legal
        return [(a, .5 / len(legal) + .5 * (a == self.teacher)) for a in legal]


class PriorBot(FixedWorldBot):
    def select_action_tree_policy(self, state, node, legal_actions):
        if node is self._root_node:
            self.root_reselections += 1
        return super().select_action_tree_policy(state, node, legal_actions)


def search(state, model, worlds, seed, mode, teacher, deadline):
    def check():
        if time.monotonic() > deadline:
            raise TimeoutError('Diagnostic deadline reached')
    rng = np.random.RandomState(seed)
    evaluator = RootPriorEvaluator(model, check, rng)
    evaluator.mode, evaluator.teacher = mode, teacher
    evaluator.root_observation = state.observation_string()
    prior = evaluator.prior(state)
    assert np.isclose(sum(p for _, p in prior), 1) and all(p >= 0 for _, p in prior)
    bot = PriorBot(state.get_game(), evaluator, uct_c=1.5, max_simulations=128,
                   random_state=rng, max_world_samples=8, use_observation_string=True,
                   allow_inconsistent_action_sets=False,
                   final_policy_type=ismcts.ISMCTSFinalPolicyType.NORMALIZED_VISITED_COUNT,
                   child_selection_policy=ismcts.ChildSelectionPolicy.PUCT)
    bot.worlds, bot.world_index, bot.root_reselections = worlds, 0, 0
    policy = sorted(bot.run_search(state))
    node = bot._root_node
    visits = {a: info.visits for a, info in node.child_info.items()}
    assert bot.world_index == 128 and sum(visits.values()) == 127
    assert np.isclose(sum(p for _, p in policy), 1)
    assert all(a in state.legal_actions() and p >= 0 for a, p in policy)
    action = min(policy, key=lambda item: (-item[1], item[0]))[0]
    return dict(action=int(action), prior=prior, policy=policy, visits=visits,
                root_reselections=bot.root_reselections,
                root_value=evaluator.infer(state)[2], teacher_visits=visits.get(teacher, 0))


def run():
    torch.set_num_threads(1)
    deadline = time.monotonic() + 1200
    source_path = ROOT / '.selfplay/diagnostic-root-prior-20261025/sources.json'
    sources = (json.loads(source_path.read_text()) if source_path.exists()
               else json.loads(OUT.read_text())['source'])
    saved = load_checkpoint(ROOT / '.selfplay/final-verification/a9-milestones/games-00012000/model.pt')
    model = PolicyValue(saved['config']['width']).eval()
    model.load_state_dict(saved['model'])
    result = dict(complete=False, source=sources, rows=[], model_sha256=saved['model_sha256'],
                  plan=dict(simulations=128, worlds=8, prefix=24,
                            scope='Frozen root-prior diagnostic; teacher arm has extra A9 advice cost',
                            modes=['learned', 'uniform', 'teacher50']))
    with Bridge() as bridge:
        for index, record in enumerate(sources):
            match = record['match']
            seed = match['seed']
            for mirror in (False, True):
                state = paired_state(bridge, seed, bool(match['swap']) ^ mirror)
                for a in match['actions'][:24]:
                    state.apply_action(a)
                player = state.current_player()
                teacher = bridge.call('baseline', state=state.data, baseline='a9', seed=seed ^ 0x9132)
                rng = np.random.RandomState(seed ^ 0x8912)
                worlds = [XYState(bridge, resample(state.data, player, rng)) for _ in range(8)]
                arms = {mode: search(state, model, worlds, seed ^ 0x7192, mode, teacher, deadline)
                        for mode in result['plan']['modes']}
                assert len({a['root_value'] for a in arms.values()}) == 1
                outcomes = {}
                for a in sorted({teacher, *(arm['action'] for arm in arms.values())}):
                    trial = state.clone()
                    trial.apply_action(a)
                    moves = [a]
                    while not trial.is_terminal():
                        if time.monotonic() > deadline:
                            raise TimeoutError('Diagnostic deadline reached')
                        chosen = bridge.call('baseline', state=trial.data, baseline='a9',
                                             seed=seed + len(moves) + 4000)
                        trial.apply_action(chosen)
                        moves.append(chosen)
                    outcomes[str(a)] = dict(moves=moves, utility=float(trial.returns()[player]), final=trial.data)
                result['rows'].append(dict(group='selection' if index < 2 else 'confirmation',
                                           seed=seed, swap=bool(match['swap']) ^ mirror,
                                           prefix=match['actions'][:24], root=state.data, player=player,
                                           teacher=teacher, arms=arms, outcomes=outcomes,
                                           world_pool_sha256=digest([w.data for w in worlds])))
                OUT.write_text(json.dumps(result, indent=2) + '\n')
                print(json.dumps(dict(seed=seed, mirror=mirror,
                                     actions={k: v['action'] for k, v in arms.items()})), flush=True)
    result['complete'] = True
    OUT.write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    run()
