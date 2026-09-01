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
