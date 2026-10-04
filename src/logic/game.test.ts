import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from './deck';
import { gameReducer, INITIAL_GAME_STATE, isValidGameState } from './game';
import type { GameState } from './types';

function createPlayingState(): GameState {
    const started = gameReducer(INITIAL_GAME_STATE, {
        type: 'START_GAME',
        payload: {
            initialDeck: createDeck(),
            initialDice: [6, 5, 4, 3, 2],
            startingPlayer: 0,
        },
    });
    return gameReducer(started, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
}

test('starts from validated deterministic inputs', () => {
    assert.equal(isValidGameState(INITIAL_GAME_STATE), true);
    const state = createPlayingState();
    assert.equal(state.phase, 'playing');
    assert.equal(state.currentPlayerIndex, 0);
    assert.deepEqual(state.players[0].dice, [6, 5, 4, 3, 2]);
    assert.equal(state.players[0].hand.length, 4);
    assert.equal(state.deck.length, 44);
    assert.equal(isValidGameState(state), true);
});

test('rejects malformed placements without mutating state', () => {
    const state = createPlayingState();
    const result = gameReducer(state, {
        type: 'PLACE_AND_DRAW',
        payload: { cardId: state.players[0].hand[0].id, colIndex: 5, isHidden: false },
    });
    assert.equal(result, state);
});

test('rejects malformed synchronized state', () => {
    const state = createPlayingState();
    const malformed = { ...state, currentPlayerIndex: 9 } as unknown as GameState;
    assert.equal(gameReducer(state, { type: 'SYNC_STATE', payload: malformed }), state);
});

test('synchronized chance state rejects duplicate cards, false identities, and divergent dice', () => {
    const state = createPlayingState();
    const duplicated = structuredClone(state);
    duplicated.players[1].hand[0] = duplicated.players[0].hand[0];
    const falseIdentity = structuredClone(state);
    falseIdentity.players[0].hand[0].rank = 14;
    const divergentDice = structuredClone(state);
    divergentDice.players[1].dice = [...divergentDice.players[1].dice];
    divergentDice.players[1].dice[0] = 1;
    for (const malformed of [duplicated, falseIdentity, divergentDice]) {
        assert.equal(isValidGameState(malformed), false);
        assert.equal(gameReducer(state, { type: 'SYNC_STATE', payload: malformed }), state);
    }
});

test('a duplicated supplied deck falls back to a valid 52-card permutation', () => {
    const deck = createDeck();
    deck[1] = deck[0];
    const state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck: deck } });
    const cards = [...state.deck, ...state.players.flatMap(player => player.hand)];
    assert.equal(cards.length, 52);
    assert.equal(new Set(cards.map(card => card.id)).size, 52);
    assert.equal(isValidGameState(state), true);
});

test('sparse synchronized arrays are rejected without throwing', () => {
    const state = createPlayingState();
    const variants = Array.from({ length: 6 }, () => structuredClone(state));
    delete variants[0].players[0];
    delete variants[1].deck[0];
    delete variants[2].players[0].hand[0];
    delete variants[3].players[0].dice[0];
    delete variants[4].players[0].board[0];
    delete variants[5].players[0].board[0][0];
    variants.forEach(variant => assert.equal(isValidGameState(variant), false));
});

test('legal prefixes conserve all cards and held cards despite bonus draws and auto-pass', () => {
    let seed = 100210103;
    for (let game = 0; game < 100; game++) {
        let state = createPlayingState();
        state.currentPlayerIndex = game % 2;
        let moves = 0;
        while (state.phase === 'playing') {
            const player = state.players[state.currentPlayerIndex];
            const available = player.board[2].flatMap((card, column) => card === null ? [column] : []);
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const chosen = player.hand[0].id;
            const retained = player.hand.slice(1).map(card => card.id);
            const actor = state.currentPlayerIndex;
            const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: {
                cardId: chosen, colIndex: available[seed % available.length], isHidden: false,
            } });
            assert.notEqual(next, state);
            assert.ok(retained.every(id => next.players[actor].hand.some(card => card.id === id)));
            assert.ok(isValidGameState(next));
            const cards = [...next.deck, ...next.players.flatMap(p => [...p.hand, ...p.board.flat().filter(Boolean)])];
            assert.equal(cards.length, 52);
            next.players.forEach(p => assert.ok(p.hand.length <= 9));
            state = next;
            moves++;
        }
        assert.equal(moves, 30);
        assert.equal(state.phase, 'scoring');
        assert.equal(state.deck.length, 9);
        assert.equal(state.players.reduce((sum, p) => sum + p.bonusesClaimed, 0), 5);
    }
});
