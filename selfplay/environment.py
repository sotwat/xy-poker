"""OpenSpiel search adapter; all actual transitions use XY's TypeScript reducer."""
import copy
import hashlib
import json
import selectors
import subprocess
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pyspiel

ROOT = Path(__file__).resolve().parents[1]
SUITS = ('hearts', 'diamonds', 'clubs', 'spades')
CARDS = [dict(suit=suit, rank=rank, id=f'{suit}-{rank}')
         for suit in SUITS for rank in range(2, 15)]
CARD_INDEX = {card['id']: i for i, card in enumerate(CARDS)}
ACTIONS = 522
FEATURES = 30 * 54 + 30 + 52 + 5 + 9


def rules_digest():
    digest = hashlib.sha256()
    for path in ('src/logic/game.ts', 'src/logic/deck.ts', 'src/logic/evaluation.ts',
                 'src/logic/scoring.ts', 'src/logic/types.ts', 'scripts/selfplay_bridge.ts',
                 'selfplay/environment.py'):
        digest.update(path.encode())
        digest.update((ROOT / path).read_bytes())
    return digest.hexdigest()


class Bridge:
    def __init__(self):
        self.process = subprocess.Popen(
            ['node', '--import', 'tsx', 'scripts/selfplay_bridge.ts'], cwd=ROOT,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)

    def call(self, op, **kwargs):
        self.process.stdin.write(json.dumps(dict(op=op, **kwargs)) + '\n')
        self.process.stdin.flush()
        if not self.selector.select(timeout=30):
            self.close()
            raise TimeoutError('XY reducer did not respond within 30 seconds')
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError('XY reducer exited unexpectedly')
        reply = json.loads(line)
        if 'error' in reply:
            raise ValueError(reply['error'])
        return reply['result']

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        self.selector.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def observation(data, player):
    """Only the acting player's current observable information, relative seats."""
    result = dict(phase=data['phase'], turn=data['turnCount'],
                  actor=int(data['currentPlayerIndex'] != player), deck=len(data['deck']))
    players = []
    for seat in (player, 1 - player):
        p = data['players'][seat]
        board = [[None if c is None else
                  ('hidden' if seat != player and c.get('isHidden') else c['id'])
                  for c in row] for row in p['board']]
        players.append(dict(board=board,
                            hidden=[[bool(c and c.get('isHidden')) for c in row] for row in p['board']],
                            hand=sorted(c['id'] for c in p['hand']) if seat == player else len(p['hand']),
                            dice=p['dice'], hiddenCount=p['hiddenCardsCount'], bonuses=p['bonusesClaimed']))
    result['players'] = players
    return result


def features(data, player):
    obs = observation(data, player)
    result = []
    for p in obs['players']:
        for row in p['board']:
            for card in row:
                code = 0 if card is None else 1 if card == 'hidden' else CARD_INDEX[card] + 2
                result.extend(float(i == code) for i in range(54))
    for p in obs['players']:
        result.extend(float(hidden) for row in p['hidden'] for hidden in row)
    hand = set(obs['players'][0]['hand'])
    result.extend(float(c['id'] in hand) for c in CARDS)
    result.extend(d / 6 for d in obs['players'][0]['dice'])
    own, opp = obs['players']
    result.extend([len(hand) / 10, opp['hand'] / 10, own['hiddenCount'] / 3,
                   opp['hiddenCount'] / 3, own['bonuses'] / 5, opp['bonuses'] / 5,
                   obs['turn'] / 31, float(obs['phase'] == 'turn_selection'), obs['deck'] / 52])
    return np.asarray(result, dtype=np.float32)


def legal_actions(data):
    if data['phase'] == 'ended':
        return []
    if data['phase'] == 'turn_selection':
        return [520, 521]
    if data['phase'] != 'playing':
        raise ValueError('Unexpected phase')
    player = data['players'][data['currentPlayerIndex']]
    actions = []
    for card in player['hand']:
        for col in range(5):
            if player['board'][2][col] is not None:
                continue
            base = CARD_INDEX[card['id']] * 10 + col * 2
            actions.append(base)
            if player['hiddenCardsCount'] < 3 and sum(
                    bool(row[col] and row[col].get('isHidden')) for row in player['board']) < 2:
                actions.append(base + 1)
    return sorted(actions)


def resample(data, player, rng):
    """Uniform unknown-card prior, independent of true hand/deck/hidden identities."""
    sampled = copy.deepcopy(data)
    own, opp = sampled['players'][player], sampled['players'][1 - player]
    known = {c['id'] for c in own['hand']}
    known.update(c['id'] for row in own['board'] for c in row if c)
    known.update(c['id'] for row in opp['board'] for c in row if c and not c.get('isHidden'))
    unknown = [dict(c) for c in CARDS if c['id'] not in known]
    rng.shuffle(unknown)
    for row in opp['board']:
        for col, card in enumerate(row):
            if card and card.get('isHidden'):
                row[col] = dict(unknown.pop(), isHidden=True)
    opp['hand'] = [unknown.pop() for _ in opp['hand']]
    sampled['deck'] = unknown
    if len(sampled['deck']) != len(data['deck']):
        raise ValueError('Sampled deck size mismatch')
    return sampled


class XYGame:
    def get_type(self):
        return SimpleNamespace(dynamics=pyspiel.GameType.Dynamics.SEQUENTIAL,
                               information=pyspiel.GameType.Information.IMPERFECT_INFORMATION)


class XYState:
    def __init__(self, bridge, data):
        self.bridge, self.data = bridge, data

    def get_game(self):
        return XYGame()

    def clone(self):
        return XYState(self.bridge, copy.deepcopy(self.data))

    def current_player(self):
        return self.data['currentPlayerIndex']

    def legal_actions(self, _player=None):
        return legal_actions(self.data)

    def observation_string(self):
        return json.dumps(observation(self.data, self.current_player()), sort_keys=True)

    def is_terminal(self):
        return self.data['phase'] == 'ended'

    def is_chance_node(self):
        return False  # Chance is sampled as the hidden initial deal, never exposed to the policy.

    def returns(self):
        if not self.is_terminal():
            raise ValueError('Only terminal states have returns')
        diff = self.data['players'][0]['score'] - self.data['players'][1]['score']
        value = float(np.sign(diff))
        return np.array([value, -value])

    def apply_action(self, action):
        if action not in self.legal_actions():
            raise ValueError('Illegal action')
        self.data = self.bridge.call('step', state=self.data, action=int(action), seed=0)
