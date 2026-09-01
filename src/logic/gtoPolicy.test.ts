import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_AI_PARAMS,
    getBestMove,
    getBestTurnOrder,
    getLastAiDecisionDiagnostics,
    getRemainingDeck,
} from './ai';
import { createDeck } from './deck';
import { gameReducer, INITIAL_GAME_STATE } from './game';
import {
    analyzePureStraightPlan,
    analyzeDiceBoard,
    getGtoHideProbability,
    getGtoTurnOrderScore,
    scoreGtoMove,
    XY_GTO_A1,
    XY_GTO_A2,
} from './gtoPolicy';
import type { Card, GameState } from './types';

function startedState(dice = [6, 5, 4, 2, 1]): GameState {
    return gameReducer(INITIAL_GAME_STATE, {
        type: 'START_GAME',
        payload: { initialDeck: createDeck(), initialDice: dice, startingPlayer: 0 },
    });
}

test('GTO turn selection prefers second on a flat board except with a structured hand', () => {
    const state = startedState([4, 4, 4, 4, 4]);
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

test('dice-board metrics distinguish equal-mean flat and polarized regimes', () => {
    const flat = analyzeDiceBoard([4, 4, 4, 4, 4]);
    const polarized = analyzeDiceBoard([6, 6, 6, 1, 1]);

    assert.equal(flat.mean, polarized.mean);
    assert.equal(flat.variance, 0);
    assert.equal(polarized.variance, 6);
    assert.ok(polarized.bonusRaceIndex > 0.9);
    assert.equal(polarized.xValueMultiplier, 0.86);
});

test('66611 changes first-mover and trash-column incentives without wasting premium cards', () => {
    const polarState = startedState([6, 6, 6, 1, 1]);
    const flatState = startedState([4, 4, 4, 4, 4]);
    const hand = [
        { id: 'trash', rank: 2, suit: 'hearts' },
        { id: 'middle', rank: 7, suit: 'clubs' },
        { id: 'queen', rank: 12, suit: 'spades' },
        { id: 'ace', rank: 14, suit: 'diamonds' },
    ] as Card[];
    const polarPlayer = { ...polarState.players[0], hand };
    const flatPlayer = { ...flatState.players[0], hand };
    const state = {
        ...polarState,
        players: [polarPlayer, polarState.players[1]],
    } as GameState;

    assert.ok(getGtoTurnOrderScore(polarPlayer) > 0);
    assert.ok(getGtoTurnOrderScore(flatPlayer) < 0);
    assert.ok(getGtoTurnOrderScore(polarPlayer, XY_GTO_A1) < 0);
    assert.ok(scoreGtoMove(state, 0, hand[0], 3) > scoreGtoMove(state, 0, hand[0], 0));
    assert.ok(scoreGtoMove(state, 0, hand[2], 0) > scoreGtoMove(state, 0, hand[2], 3));
    assert.ok(scoreGtoMove(state, 0, hand[0], 0, XY_GTO_A1)
        > scoreGtoMove(state, 0, hand[0], 3, XY_GTO_A1));
});

test('66611 rewards completing a cheap bonus column early while A1 still delays it', () => {
    const base = startedState([6, 6, 6, 1, 1]);
    const board = base.players[0].board.map(row => [...row]);
    board[0][3] = { id: 'low-a', rank: 3, suit: 'hearts' };
    board[1][3] = { id: 'low-b', rank: 4, suit: 'clubs' };
    const trash = { id: 'low-c', rank: 2, suit: 'spades' } as Card;
    const state = {
        ...base,
        phase: 'playing',
        turnCount: 4,
        players: [
            {
                ...base.players[0],
                board,
                hand: [
                    trash,
                    { id: 'eight', rank: 8, suit: 'hearts' },
                    { id: 'ten', rank: 10, suit: 'clubs' },
                    { id: 'king', rank: 13, suit: 'diamonds' },
                ],
            },
            base.players[1],
        ],
    } as GameState;

    assert.ok(scoreGtoMove(state, 0, trash, 3) > scoreGtoMove(state, 0, trash, 4));
    assert.ok(scoreGtoMove(state, 0, trash, 3, XY_GTO_A1)
        < scoreGtoMove(state, 0, trash, 4, XY_GTO_A1));
});

test('pure-straight planning recognizes ordered prefixes and held completion cards', () => {
    const plan = analyzePureStraightPlan([
        { id: 'five', rank: 5, suit: 'hearts' },
        { id: 'six', rank: 6, suit: 'clubs' },
    ], [
        { id: 'seven', rank: 7, suit: 'spades' },
        { id: 'king', rank: 13, suit: 'diamonds' },
    ]);
    const unordered = analyzePureStraightPlan([
        { id: 'five', rank: 5, suit: 'hearts' },
        { id: 'seven', rank: 7, suit: 'clubs' },
    ], [{ id: 'six', rank: 6, suit: 'spades' }]);

    assert.equal(plan.viableSequences, 1);
    assert.equal(plan.completionOuts, 4);
    assert.equal(plan.completionHeld, true);
    assert.equal(plan.secured, true);
    assert.equal(unordered.viableSequences, 0);
});

test('A3 invests in a secured pure straight where A2 overvalues a lower pure pair', () => {
    const base = startedState([6, 5, 4, 2, 1]);
    const board = base.players[0].board.map(row => [...row]);
    board[0][0] = { id: 'straight-five', rank: 5, suit: 'hearts' };
    board[0][1] = { id: 'pair-five-a', rank: 5, suit: 'diamonds' };
    const straightSix = { id: 'straight-six', rank: 6, suit: 'clubs' } as Card;
    const pairFive = { id: 'pair-five-b', rank: 5, suit: 'clubs' } as Card;
    const hand = [
        straightSix,
        pairFive,
        { id: 'straight-seven', rank: 7, suit: 'spades' },
        { id: 'ace', rank: 14, suit: 'hearts' },
    ] as Card[];
    const state = {
        ...base,
        players: [{ ...base.players[0], board, hand }, base.players[1]],
    } as GameState;

    assert.ok(scoreGtoMove(state, 0, pairFive, 1, XY_GTO_A2)
        > scoreGtoMove(state, 0, straightSix, 0, XY_GTO_A2));
    assert.ok(scoreGtoMove(state, 0, straightSix, 0)
        > scoreGtoMove(state, 0, pairFive, 1));
});

test('GTO move score reacts to dice and delays an early third row commitment', () => {
    const state = startedState();
    const card = state.players[0].hand[0];
    const premiumCard = { id: 'premium', rank: 12, suit: 'hearts' } as Card;
    assert.ok(scoreGtoMove(state, 0, premiumCard, 0) > scoreGtoMove(state, 0, premiumCard, 4));

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

test('runtime AI completes full-rule belief rollouts instead of timing out to its prior', () => {
    let state = startedState();
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
    const move = getBestMove(state, 0, {
        ...DEFAULT_AI_PARAMS,
        mcSimulations: 2,
        timeBudgetMs: 2_000,
    });
    const diagnostics = getLastAiDecisionDiagnostics();

    assert.ok(state.players[0].hand.some(card => card.id === move.cardId));
    assert.equal(state.players[0].board[2][move.colIndex], null);
    assert.equal(diagnostics.completedBeliefSamples, 2);
    assert.equal(diagnostics.usedRollout, true);
    assert.ok(diagnostics.searchedMoves > 1);
});

test('runtime AI decision cannot depend on the true deck order or hidden identities', () => {
    let base = startedState();
    base = gameReducer(base, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
    const hiddenBoard = base.players[1].board.map(row => [...row]);
    hiddenBoard[0][0] = { ...base.players[1].hand[0], isHidden: true };
    const stateA = {
        ...base,
        players: [
            base.players[0],
            { ...base.players[1], board: hiddenBoard, hand: base.players[1].hand.slice(1) },
        ],
    } as GameState;
    const alternateBoard = stateA.players[1].board.map(row => [...row]);
    alternateBoard[0][0] = { ...stateA.deck[10], isHidden: true };
    const stateB = {
        ...stateA,
        deck: [...stateA.deck].reverse(),
        players: [
            stateA.players[0],
            {
                ...stateA.players[1],
                board: alternateBoard,
                hand: [...stateA.players[1].hand].reverse(),
            },
        ],
    } as GameState;
    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
        const params = { ...DEFAULT_AI_PARAMS, mcSimulations: 2, timeBudgetMs: 2_000 };
        assert.deepEqual(getBestMove(stateA, 0, params), getBestMove(stateB, 0, params));
    } finally {
        Math.random = originalRandom;
    }
});
