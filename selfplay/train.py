"""Local policy/value learning from OpenSpiel IS-MCTS self-play."""
import argparse
import copy
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import time

import numpy as np
from open_spiel.python.algorithms import ismcts
import torch
from torch import nn

from environment import ACTIONS, CARDS, FEATURES, Bridge, XYState, features, resample, rules_digest

SCHEMA = 1
TRAINING_METHOD = 'mixed-a9-teacher-worlds8-v1'


def episode_plan(total_games, population_size):
    """Half self-play, quarter teacher, quarter past; both seats per opponent."""
    if total_games < 0 or population_size < 0:
        raise ValueError('Negative episode count or population size')
    slot = total_games % 8
    ordinal = (total_games // 8) * 2 + slot // 4
    seat = ordinal % 2
    if slot in (2, 6):
        return 'baseline', None, seat
    if slot in (3, 7) and population_size:
        return 'past-model', (ordinal // 2) % population_size, seat
    return 'self', None, total_games % 2


def training_sample(state, policy, player, source):
    mask = torch.zeros(ACTIONS, dtype=torch.bool)
    mask[state.legal_actions()] = True
    if (not np.isfinite(policy).all() or not np.isclose(policy.sum(), 1)
            or np.any(policy < 0) or np.any(policy[~mask.numpy()] != 0)):
        raise ValueError('Invalid training target')
    return dict(x=torch.from_numpy(features(state.data, player)),
                pi=torch.from_numpy(policy.copy()), mask=mask, player=player, source=source)


class Stopped(Exception):
    pass


class PolicyValue(nn.Module):
    def __init__(self, width=128):
        super().__init__()
        self.body = nn.Sequential(nn.Linear(FEATURES, width), nn.ReLU(),
                                  nn.Linear(width, width), nn.ReLU())
        self.policy = nn.Linear(width, ACTIONS)
        self.value = nn.Linear(width, 1)

    def forward(self, x):
        h = self.body(x)
        return self.policy(h), torch.tanh(self.value(h)).squeeze(-1)


class Evaluator:
    def __init__(self, model, check_stop, rng, root_key=None):
        self.model, self.check_stop, self.rng = model, check_stop, rng
        self.root_key = root_key
        self.cache = {}

    def infer(self, state):
        self.check_stop()
        key = state.observation_string()
        if key not in self.cache:
            with torch.no_grad():
                logits, value = self.model(torch.from_numpy(features(state.data, state.current_player())))
                legal = state.legal_actions()
                probabilities = torch.softmax(logits[legal], dim=0).numpy().astype(np.float64)
            self.cache[key] = (legal, probabilities, float(value))
        return self.cache[key]

    def prior(self, state):
        legal, probabilities, _ = self.infer(state)
        if state.observation_string() == self.root_key:
            probabilities = .75 * probabilities + .25 * self.rng.dirichlet([.3] * len(legal))
        return list(zip(legal, probabilities))

    def evaluate(self, state):
        _, _, value = self.infer(state)
        return np.array([value, -value]) if state.current_player() == 0 else np.array([-value, value])


def search(state, model, simulations, rng, check_stop=lambda: None, explore=False, world_samples=8):
    evaluator = Evaluator(model, check_stop, rng, state.observation_string() if explore else None)
    bot = ismcts.ISMCTSBot(state.get_game(), evaluator, uct_c=1.5,
                          max_simulations=simulations, random_state=rng,
                          max_world_samples=world_samples,
                          use_observation_string=True, allow_inconsistent_action_sets=False,
                          final_policy_type=ismcts.ISMCTSFinalPolicyType.NORMALIZED_VISITED_COUNT,
                          child_selection_policy=ismcts.ChildSelectionPolicy.PUCT)
    bot.set_resampler(lambda original, player: XYState(
        original.bridge, resample(original.data, player, rng)))
    policy = np.zeros(ACTIONS, dtype=np.float32)
    for action, probability in bot.run_search(state):
        policy[action] = probability
    if not np.isfinite(policy).all() or not np.isclose(policy.sum(), 1):
        raise ValueError('Invalid search policy')
    return policy


def paired_state(bridge, seed, swap=False):
    state = bridge.call('new', seed=int(seed))
    if swap:
        state['players'].reverse()
        state['players'][0]['id'], state['players'][1]['id'] = 'p1', 'p2'
        state['currentPlayerIndex'] = 1 - state['currentPlayerIndex']
    return XYState(bridge, state)


def play(bridge, model, seed, simulations, check_stop=lambda: None, opponent=None,
         model_seat=0, swap=False, training=False, baseline='a9'):
    rng = np.random.RandomState(int(seed) ^ 0x596170)
    state = paired_state(bridge, seed, swap)
    samples, moves = [], []
    while not state.is_terminal():
        check_stop()
        player = state.current_player()
        if opponent == 'baseline' and player != model_seat:
            action = bridge.call('baseline', state=state.data, baseline=baseline,
                                 seed=int(rng.randint(2**31)))
            if training:
                policy = np.zeros(ACTIONS, dtype=np.float32)
                policy[action] = 1
                samples.append(training_sample(state, policy, player, 'teacher-' + baseline))
        elif opponent == 'random' and player != model_seat:
            action = int(rng.choice(state.legal_actions()))
        else:
            actor_model = opponent if isinstance(opponent, PolicyValue) and player != model_seat else model
            policy = search(state, actor_model, simulations, rng, check_stop, explore=training)
            if training and (opponent is None or player == model_seat):
                samples.append(training_sample(state, policy, player, 'search'))
            if training:
                probabilities = policy.astype(np.float64)
                probabilities /= probabilities.sum()
                action = int(rng.choice(ACTIONS, p=probabilities))
            else:
                action = int(rng.choice(np.flatnonzero(policy == policy.max())))
        state.apply_action(action)
        moves.append(int(action))
        if len(moves) > 31:
            raise RuntimeError('Game exceeded 31 decisions')
    returns = state.returns()
    for sample in samples:
        sample['z'] = float(returns[sample.pop('player')])
    return samples, dict(seed=int(seed), swap=swap, model_seat=model_seat,
                         actions=moves, returns=returns.tolist(),
                         scores=[p['score'] for p in state.data['players']])


def learn(model, optimizer, replay, rng, steps, batch_size, check_stop=lambda: None):
    model.train()
    losses = []
    for _ in range(steps):
        check_stop()
        batch = [replay[int(i)] for i in rng.randint(len(replay), size=min(batch_size, len(replay)))]
        x = torch.stack([s['x'] for s in batch])
        pi = torch.stack([s['pi'] for s in batch])
        mask = torch.stack([s['mask'] for s in batch])
        target = torch.tensor([s['z'] for s in batch])
        logits, value = model(x)
        logp = torch.log_softmax(logits.masked_fill(~mask, -1e9), dim=1)
        policy_loss = -(pi * logp).sum(dim=1).mean()
        value_loss = torch.square(value - target).mean()
        loss = policy_loss + value_loss
        if not torch.isfinite(loss):
            raise ValueError('Non-finite training loss')
        optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 5)
        optimizer.step()
        losses.append([float(policy_loss.detach()), float(value_loss.detach())])
    model.eval()
    return dict(policy_loss=float(np.mean([x[0] for x in losses])),
                value_loss=float(np.mean([x[1] for x in losses])))


def fingerprint(model):
    digest = hashlib.sha256()
    for tensor in model.state_dict().values():
        digest.update(tensor.detach().cpu().numpy().tobytes())
    return digest.hexdigest()


def atomic_save(path, payload):
    temporary = path.with_suffix(path.suffix + '.tmp')
    with temporary.open('wb') as handle:
        torch.save(payload, handle)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def load_checkpoint(path):
    data = torch.load(path, map_location='cpu', weights_only=True)
    if data.get('schema') != SCHEMA or data.get('features') != FEATURES or data.get('actions') != ACTIONS:
        raise ValueError('Checkpoint schema mismatch')
    if data.get('rules_sha256') != rules_digest():
        raise ValueError('Rules/observation implementation changed; use a fresh output directory')
    return data


def emit(path, event):
    event = dict(time=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), **event)
    with path.open('a') as handle:
        handle.write(json.dumps(event, allow_nan=False) + '\n')
    print(json.dumps(event, allow_nan=False), flush=True)


def rng_pack(rng):
    name, keys, pos, gauss, cached = rng.get_state()
    return [name, keys.tolist(), pos, gauss, cached]


def evaluation_summary(results, pairs, opponent):
    utilities = [sum(m['returns'][0] for m in pair) / 2 for pair in results]
    flat = [m['returns'][0] for pair in results for m in pair]
    mean = float(np.mean(utilities)) if utilities else None
    # Independent units are deals, not the two correlated seat-swapped games.
    radius = math.sqrt(2 * math.log(40) / len(results)) if results else None
    return dict(opponent=opponent, planned_pairs=pairs, pairs=len(results), games=2 * len(results),
                complete=len(results) == pairs, wins=flat.count(1), draws=flat.count(0),
                losses=flat.count(-1), mean_utility=mean,
                hoeffding95=[max(-1, mean - radius), min(1, mean + radius)] if results else None,
                matches=results)


def evaluate(bridge, model, seed, pairs, simulations, opponent, check_stop=lambda: None,
             baseline='a9', progress=None):
    results = []
    label = baseline if opponent == 'baseline' else opponent if isinstance(opponent, str) else 'previous-model'
    for index in range(pairs):
        pair = []
        try:
            for swap in (False, True):
                _, match = play(bridge, model, seed + index, simulations, check_stop,
                                opponent=opponent, model_seat=0, swap=swap, baseline=baseline)
                pair.append(match)
        except Stopped:
            if progress is None:
                raise
            break
        results.append(pair)
        if progress:
            progress(evaluation_summary(results, pairs, label))
    return evaluation_summary(results, pairs, label)


def train(args):
    directory = Path(args.output).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'run.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('Another training process owns this output directory') from error
        run_training(args, directory)


def run_training(args, directory):
    checkpoint = directory / 'latest.pt'
    if checkpoint.exists() and not args.resume:
        raise ValueError('Output contains a checkpoint; use --resume or a new directory')
    if args.resume and not checkpoint.exists():
        raise ValueError('--resume requires latest.pt')
    torch.set_num_threads(2)
    torch.manual_seed(args.seed)
    rng = np.random.RandomState(args.seed)
    model = PolicyValue(args.width)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=1e-4)
    replay, population, iteration, games_done, total_games = [], [], 0, 0, 0
    checkpoint_migrations = []
    config = {k: getattr(args, k) for k in ('seed', 'width', 'simulations', 'games', 'steps',
                                          'batch_size', 'replay_size', 'learning_rate')}
    if args.resume:
        saved = load_checkpoint(checkpoint)
        if saved.get('training_method') not in (None, TRAINING_METHOD):
            raise ValueError('Unknown checkpoint training method')
        if saved['config'] != config:
            raise ValueError('Resume learning settings must match checkpoint config')
        model.load_state_dict(saved['model'])
        optimizer.load_state_dict(saved['optimizer'])
        replay, population = saved['replay'], saved['population']
        checkpoint_migrations = saved.get('checkpoint_migrations', [])
        iteration, games_done, total_games = saved['iteration'], saved['games_done'], saved['total_games']
        state = saved['rng']
        rng.set_state((state[0], np.asarray(state[1], dtype=np.uint32), *state[2:]))
        torch.set_rng_state(saved['torch_rng'])
    model.eval()
    deadline = time.monotonic() + args.minutes * 60
    wall_deadline = time.time() + args.minutes * 60
    stopping = False

    def handle_signal(_signum, _frame):
        nonlocal stopping
        stopping = True

    def check_stop():
        if stopping or time.monotonic() >= deadline or time.time() >= wall_deadline:
            raise Stopped()

    def save():
        atomic_save(checkpoint, dict(schema=SCHEMA, features=FEATURES, actions=ACTIONS,
                                    rules_sha256=rules_digest(),
                                    config=config, model=model.state_dict(), optimizer=optimizer.state_dict(),
                                    replay=replay, population=population, iteration=iteration,
                                    games_done=games_done, total_games=total_games,
                                    rng=rng_pack(rng), torch_rng=torch.get_rng_state(),
                                    model_sha256=fingerprint(model),
                                    training_method=TRAINING_METHOD,
                                    checkpoint_migrations=checkpoint_migrations))

    prior_handlers = {sig: signal.signal(sig, handle_signal) for sig in (signal.SIGINT, signal.SIGTERM)}
    save()
    start_iteration = iteration
    log = directory / 'events.jsonl'
    emit(log, dict(event='start', iteration=iteration, config=config, resume=args.resume,
                   training_method=TRAINING_METHOD,
                   method='OpenSpiel IS-MCTS + policy/value network', device='cpu'))
    try:
        with Bridge() as bridge:
            while iteration < start_iteration + args.iterations:
                while games_done < args.games:
                    check_stop()
                    game_seed = (args.seed + total_games * 104729) % (2**31)
                    old = None
                    opponent_kind, opponent_index, model_seat = episode_plan(total_games, len(population))
                    if opponent_kind == 'past-model':
                        old = copy.deepcopy(model)
                        old.load_state_dict(population[opponent_index])
                        old.eval()
                    elif opponent_kind == 'baseline':
                        old = 'baseline'
                    samples, match = play(bridge, model, game_seed, args.simulations, check_stop,
                                          opponent=old, model_seat=model_seat, training=True)
                    replay.extend(samples)
                    replay[:] = replay[-args.replay_size:]
                    games_done += 1
                    total_games += 1
                    save()
                    emit(log, dict(event='selfplay', iteration=iteration, games_done=games_done,
                                   total_games=total_games, samples=len(samples), replay=len(replay),
                                   opponent=opponent_kind, opponent_index=opponent_index,
                                   teacher_samples=sum(s.get('source') == 'teacher-a9' for s in samples),
                                   training_method=TRAINING_METHOD, match=match))
                check_stop()
                before = copy.deepcopy(model.state_dict())
                old_hash = fingerprint(model)
                optimizer_before = copy.deepcopy(optimizer.state_dict())
                rng_before, torch_before = rng.get_state(), torch.get_rng_state()
                try:
                    losses = learn(model, optimizer, replay, rng, args.steps, args.batch_size, check_stop)
                except Exception:
                    model.load_state_dict(before)
                    optimizer.load_state_dict(optimizer_before)
                    rng.set_state(rng_before)
                    torch.set_rng_state(torch_before)
                    model.eval()
                    raise
                population.append(before)
                population[:] = population[-4:]
                iteration += 1
                games_done = 0
                save()
                atomic_save(directory / f'model-{iteration:05d}.pt',
                            dict(schema=SCHEMA, features=FEATURES, actions=ACTIONS, config=config,
                                 rules_sha256=rules_digest(),
                                 training_method=TRAINING_METHOD,
                                 model=model.state_dict(), model_sha256=fingerprint(model),
                                 checkpoint_migrations=checkpoint_migrations))
                emit(log, dict(event='learn', iteration=iteration, before=old_hash,
                               after=fingerprint(model), **losses))
                if args.eval_pairs:
                    previous = copy.deepcopy(model)
                    previous.load_state_dict(before)
                    previous.eval()
                    evaluation = evaluate(bridge, model, args.eval_seed, args.eval_pairs,
                                          args.simulations, previous, check_stop)
                    emit(log, dict(event='evaluation', iteration=iteration, **evaluation,
                                   promotion='research-only; no production promotion'))
    except Stopped:
        emit(log, dict(event='stopped', iteration=iteration, games_done=games_done,
                       total_games=total_games, incomplete_game='discarded; replayed on resume'))
    finally:
        save()
        for sig, handler in prior_handlers.items():
            signal.signal(sig, handler)
    emit(log, dict(event='saved', checkpoint=str(checkpoint), iteration=iteration,
                   total_games=total_games, model_sha256=fingerprint(model)))


def positive_int(value):
    result = int(value)
    if result < 1:
        raise argparse.ArgumentTypeError('Must be positive')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('train')
    p.add_argument('--output', default='.selfplay/default')
    p.add_argument('--resume', action='store_true')
    p.add_argument('--iterations', type=positive_int, default=10, help='Additional iterations on resume')
    p.add_argument('--games', type=positive_int, default=8)
    p.add_argument('--simulations', type=positive_int, default=128)
    p.add_argument('--width', type=positive_int, default=128)
    p.add_argument('--steps', type=positive_int, default=64)
    p.add_argument('--batch-size', type=positive_int, default=64)
    p.add_argument('--replay-size', type=positive_int, default=20000)
    p.add_argument('--learning-rate', type=float, default=.001)
    p.add_argument('--seed', type=int, default=20261021)
    p.add_argument('--eval-seed', type=int, default=2**31 + 90261021)
    p.add_argument('--eval-pairs', type=int, default=4)
    p.add_argument('--minutes', type=float, default=30)
    e = commands.add_parser('evaluate')
    e.add_argument('--checkpoint', required=True)
    e.add_argument('--opponent-checkpoint')
    e.add_argument('--opponent', choices=['random', 'a7', 'a9'], default='a9')
    e.add_argument('--pairs', type=positive_int, default=20)
    e.add_argument('--simulations', type=positive_int, default=128)
    e.add_argument('--seed', type=int, default=2**31 + 110261021)
    e.add_argument('--output', default='.selfplay/evaluation.json')
    e.add_argument('--minutes', type=float, default=30)
    a = commands.add_parser('act', help='Select one move from a saved full internal game state')
    a.add_argument('--checkpoint', required=True)
    a.add_argument('--state', required=True)
    a.add_argument('--simulations', type=positive_int, default=128)
    a.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    if args.simulations < 2:
        parser.error('simulations must be at least 2')
    if args.command == 'train':
        if not 0 <= args.seed < 2**31:
            parser.error('training seed must be in [0, 2**31)')
        if not 2**31 <= args.eval_seed < 2**32 - args.eval_pairs:
            parser.error('eval-seed must be in the held-out range [2**31, 2**32)')
        if not math.isfinite(args.minutes) or args.minutes <= 0 or args.eval_pairs < 0:
            parser.error('minutes must be positive and eval-pairs nonnegative')
        if not math.isfinite(args.learning_rate) or args.learning_rate <= 0:
            parser.error('learning-rate must be positive')
        train(args)
    else:
        if args.command == 'evaluate' and not 2**31 <= args.seed < 2**32 - args.pairs:
            parser.error('evaluation seed must be in the held-out range [2**31, 2**32)')
        if args.command == 'evaluate' and (not math.isfinite(args.minutes) or args.minutes <= 0):
            parser.error('minutes must be positive')
        if args.command == 'act' and not 0 <= args.seed < 2**32:
            parser.error('seed must be in [0, 2**32)')
        torch.set_num_threads(2)
        saved = load_checkpoint(Path(args.checkpoint))
        model = PolicyValue(saved['config']['width'])
        model.load_state_dict(saved['model'])
        model.eval()
        if args.command == 'act':
            with Bridge() as bridge:
                data = bridge.call('validate', state=json.loads(Path(args.state).read_text()), seed=0)
                state = XYState(bridge, data)
                if state.is_terminal():
                    parser.error('Cannot select a move in an ended game')
                policy = search(state, model, args.simulations, np.random.RandomState(args.seed))
            action = int(np.argmax(policy))
            move = dict(goFirst=action == 520) if action >= 520 else dict(
                cardId=CARDS[action // 10]['id'], colIndex=(action % 10) // 2, isHidden=bool(action % 2))
            print(json.dumps(dict(action=action, move=move,
                                  policy=[(int(a), float(policy[a])) for a in np.flatnonzero(policy)])))
            return
        opponent = 'random' if args.opponent == 'random' else 'baseline'
        if args.opponent_checkpoint:
            prior = load_checkpoint(Path(args.opponent_checkpoint))
            opponent = PolicyValue(prior['config']['width'])
            opponent.load_state_dict(prior['model'])
            opponent.eval()
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists():
            parser.error('Evaluation output already exists; choose a new --output path')
        deadline = time.monotonic() + args.minutes * 60
        wall_deadline = time.time() + args.minutes * 60
        stopping = False

        def stop(_signal, _frame):
            nonlocal stopping
            stopping = True

        def check_stop():
            if stopping or time.monotonic() >= deadline or time.time() >= wall_deadline:
                raise Stopped()

        def progress(result):
            result.update(model_sha256=fingerprint(model), seed=args.seed,
                          simulations=args.simulations, production_changed=False)
            temp = output.with_suffix(output.suffix + '.tmp')
            temp.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
            os.replace(temp, output)

        handlers = {sig: signal.signal(sig, stop) for sig in (signal.SIGINT, signal.SIGTERM)}
        try:
            with Bridge() as bridge:
                result = evaluate(bridge, model, args.seed, args.pairs, args.simulations,
                                  opponent, check_stop, baseline=args.opponent, progress=progress)
            progress(result)
        finally:
            for sig, handler in handlers.items():
                signal.signal(sig, handler)
        print(json.dumps({k: v for k, v in result.items() if k != 'matches'}))


if __name__ == '__main__':
    main()
