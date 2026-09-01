import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_AI_PARAMS, getBestMove, getBestTurnOrder, getRemainingDeck } from './ai';
import { createDeck } from './deck';
import { gameReducer, INITIAL_GAME_STATE } from './game';
import { getGtoHideProbability, getGtoTurnOrderScore, scoreGtoMove } from './gtoPolicy';
import type { Card, GameState } from './types';

function startedState(dice = [6, 5, 4, 2, 1]): GameState {
    return gameReducer(INITIAL_GAME_STATE, {
        type: 'START_GAME',
        payload: { initialDeck: createDeck(), initialDice: dice, startingPlayer: 0 },
    });
}

test('GTO turn selection prefers second except with a sufficiently structured hand', () => {
    const state = startedState();
    assert.ok(getGtoTurnOrderScore(state.players[0]) < 0);

    const paired = {
        ...state.players[0],
        hand: [
            { id: 'a', rank: 12, suit: 'hearts' },
            { id: 'b', rank: 12, suit: 'clubs' },
            { id: 'c', rank: 13, suit: 'spades' },
            { id: 'd', rank: 14, suit: 'diamonds' },
        ] as Card[],
    };
    assert.ok(getGtoTurnOrderScore(paired) > 0);
});

test('GTO move score reacts to dice and delays an early third row commitment', () => {
    const state = startedState();
    const card = state.players[0].hand[0];
    assert.ok(scoreGtoMove(state, 0, card, 0) > scoreGtoMove(state, 0, card, 4));

    const board = state.players[0].board.map(row => [...row]);
    board[0][0] = state.players[0].hand[1];
    board[1][0] = state.players[0].hand[2];
    const early = { ...state, turnCount: 4, players: [{ ...state.players[0], board }, state.players[1]] } as GameState;
    const late = { ...early, turnCount: 28 };
    assert.ok(scoreGtoMove(late, 0, card, 0) > scoreGtoMove(early, 0, card, 0));
});

test('opponent hidden-card identity cannot change the GTO information-set score', () => {
    const state = startedState();
    const hiddenA = { ...createDeck()[20], isHidden: true };
    const hiddenB = { ...createDeck()[40], isHidden: true };
    const boardA = state.players[1].board.map(row => [...row]);
    const boardB = state.players[1].board.map(row => [...row]);
    boardA[0][0] = hiddenA;
    boardB[0][0] = hiddenB;
    const stateA = { ...state, players: [state.players[0], { ...state.players[1], board: boardA }] } as GameState;
    const stateB = { ...state, players: [state.players[0], { ...state.players[1], board: boardB }] } as GameState;
    const card = state.players[0].hand[0];

    assert.equal(scoreGtoMove(stateA, 0, card, 0), scoreGtoMove(stateB, 0, card, 0));
    assert.equal(
        getGtoHideProbability(stateA, 0, card, 0),
        getGtoHideProbability(stateB, 0, card, 0),
    );
});

test('AI unseen deck uses canonical card identities', () => {
    const deck = createDeck();
    const remaining = getRemainingDeck(deck.slice(0, 7));
    assert.equal(remaining.length, 45);
    for (const visible of deck.slice(0, 7)) {
        assert.ok(!remaining.some(card => card.id === visible.id));
    }
});

test('GTO-integrated AI completes a deterministic game using only legal moves', () => {
    let state = startedState();
    const chooser = state.currentPlayerIndex;
    const shouldGoFirst = getBestTurnOrder(state, chooser, DEFAULT_AI_PARAMS);
    state = gameReducer(state, {
        type: 'CHOOSE_TURN_ORDER',
        payload: { startingPlayer: shouldGoFirst ? chooser : 1 - chooser },
    });
    const fastParams = { ...DEFAULT_AI_PARAMS, timeBudgetMs: 1 };
    let placements = 0;

    while (state.phase === 'playing' && placements < 30) {
        const move = getBestMove(state, state.currentPlayerIndex, fastParams);
        const nextState = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        assert.notEqual(nextState, state, `AI generated an illegal move at placement ${placements + 1}`);
        state = nextState;
        placements++;
    }

    assert.equal(placements, 30);
    assert.equal(state.phase, 'scoring');
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    assert.equal(state.phase, 'ended');
    assert.ok(state.players.every(player => player.hiddenCardsCount <= 3));
});
