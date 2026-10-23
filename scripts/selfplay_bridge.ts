import { createInterface } from 'node:readline';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE, isValidGameState } from '../src/logic/game';
import { DEFAULT_AI_PARAMS, getBestMove, getBestTurnOrder } from '../src/logic/ai';
import type { GameState } from '../src/logic/types';

function randomGenerator(seed: number) {
    let value = seed >>> 0;
    return () => {
        value += 0x6D2B79F5;
        let t = Math.imul(value ^ (value >>> 15), 1 | value);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const cards = createDeck();
const cardIds = new Map(cards.map((card, index) => [card.id, index]));

function checked(state: GameState): GameState {
    if (!isValidGameState(state)) throw new Error('Invalid game state');
    const count = state.deck.length + state.players.reduce((sum, player) =>
        sum + player.hand.length + player.board.flat().filter(Boolean).length, 0);
    if (count !== 52) throw new Error(`Card conservation failed: ${count}`);
    return state;
}

interface Request {
    op: 'new' | 'step' | 'baseline' | 'validate';
    seed: number;
    state: GameState;
    action: number;
    baseline?: 'a7' | 'a9';
}

function respond(request: Request): unknown {
    const rng = randomGenerator(request.seed);
    if (request.op === 'new') {
        const deck = createDeck();
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return checked(gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: {
            initialDeck: deck,
            initialDice: Array.from({ length: 5 }, () => 1 + Math.floor(rng() * 6)).sort((a, b) => b - a),
            startingPlayer: Math.floor(rng() * 2),
        } }));
    }
    const state = checked(request.state);
    if (request.op === 'validate') return state;
    if (request.op === 'baseline') {
        const params = request.baseline === 'a7'
            ? { ...DEFAULT_AI_PARAMS, policyGeneration: 'a7' as const, mcSimulations: 1 }
            : { ...DEFAULT_AI_PARAMS };
        const originalRandom = Math.random;
        Math.random = rng;
        try {
            if (state.phase === 'turn_selection') {
                return getBestTurnOrder(state, state.currentPlayerIndex, params) ? 520 : 521;
            }
            const move = getBestMove(state, state.currentPlayerIndex, params);
            return cardIds.get(move.cardId)! * 10 + move.colIndex * 2 + Number(move.isHidden);
        } finally {
            Math.random = originalRandom;
        }
    }
    const action = request.action;
    if (!Number.isInteger(action) || action < 0 || action >= 522) throw new Error('Invalid action');
    let next: GameState;
    if (state.phase === 'turn_selection' && action >= 520) {
        next = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: {
            startingPlayer: action === 520 ? state.currentPlayerIndex : 1 - state.currentPlayerIndex,
        } });
    } else if (state.phase === 'playing' && action < 520) {
        next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: {
            cardId: cards[Math.floor(action / 10)].id,
            colIndex: Math.floor((action % 10) / 2), isHidden: action % 2 === 1,
        } });
    } else throw new Error('Action does not match phase');
    if (next === state) throw new Error('Illegal move rejected by reducer');
    if (next.phase === 'scoring') next = gameReducer(next, { type: 'CALCULATE_SCORE' });
    return checked(next);
}

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    try {
        process.stdout.write(JSON.stringify({ result: respond(JSON.parse(line) as Request) }) + '\n');
    } catch (error) {
        process.stdout.write(JSON.stringify({ error: String(error) }) + '\n');
    }
}
