import assert from 'node:assert/strict';
import test from 'node:test';
import example from './fixtures/endgame.json';
import replyExample from './fixtures/endgame-reply.json';
import { certifiedEndgameReplacement, solveFinalMove } from './endgame';
import { DEFAULT_AI_PARAMS, getBestMove, getLastAiDecisionDiagnostics } from './ai';
import { createDeck } from './deck';
import { gameReducer, INITIAL_GAME_STATE } from './game';
import type { Card, GameState } from './types';

const fixture = () => structuredClone(example.state) as GameState;
function outcome(state: GameState, cardId: string) {
    const actor = state.currentPlayerIndex;
    const column = state.players[actor].board[2].findIndex(card => card === null);
    const ended = gameReducer(gameReducer(state, { type: 'PLACE_AND_DRAW', payload: {
        cardId, colIndex: column, isHidden: false,
    } }), { type: 'CALCULATE_SCORE' });
    assert.equal(ended.phase, 'ended');
    return ended.winner === (actor === 0 ? 'p1' : 'p2') ? 1 : ended.winner === 'draw' ? 0 : -1;
}

test('A8 preserves A7 opening decisions and discards certificates when its budget expires', () => {
    let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: {
        initialDeck: createDeck(), initialDice: [6, 4, 3, 2, 1], startingPlayer: 0,
    } });
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
    const params = { ...DEFAULT_AI_PARAMS, mcSimulations: 1, timeBudgetMs: 2000 };
    assert.deepEqual(getBestMove(state, 0, { ...params, policyGeneration: 'a7' }),
        getBestMove(state, 0, { ...params, policyGeneration: 'a8' }));
    const last = fixture(), actor = last.currentPlayerIndex;
    assert.deepEqual(getBestMove(last, actor, { ...params, timeBudgetMs: 1, policyGeneration: 'a7' }),
        getBestMove(last, actor, { ...params, timeBudgetMs: 1, policyGeneration: 'a8' }));
    assert.equal(getLastAiDecisionDiagnostics().usedDominanceOverride, false);
    assert.equal(getLastAiDecisionDiagnostics().exactEndgameWorlds, 0);
});

test('every certified final replacement agrees with exhaustive real-reducer outcomes', () => {
    const state = fixture(), actor = state.currentPlayerIndex as 0 | 1;
    const own = state.players[actor], opponent = state.players[1 - actor];
    const analysis = solveFinalMove(state, actor)!;
    assert.ok(analysis);
    assert.equal(analysis.opponentCanRespond, false);
    const known = new Set([...own.hand, ...own.board.flat(), ...opponent.board.flat().filter(card => !card?.isHidden)]
        .filter((card): card is Card => card !== null).map(card => card.id));
    const unseen = createDeck().filter(card => !known.has(card.id));
    const positions: Array<[number, number]> = [];
    opponent.board.forEach((row, r) => row.forEach((card, c) => { if (card?.isHidden) positions.push([r, c]); }));
    const totals = own.hand.map(() => 0);
    const dominates = own.hand.map(() => own.hand.map(() => true));
    const chosen = new Set<string>();
    let worlds = 0;
    function enumerate(slot: number) {
        if (slot < positions.length) {
            const [row, column] = positions[slot];
            for (const card of unseen) if (!chosen.has(card.id)) {
                chosen.add(card.id);
                opponent.board[row][column] = { ...card, isHidden: true };
                enumerate(slot + 1);
                chosen.delete(card.id);
            }
            return;
        }
        worlds++;
        const utilities = own.hand.map(card => outcome(state, card.id));
        utilities.forEach((utility, i) => {
            totals[i] += utility;
            utilities.forEach((other, j) => { if (utility < other) dominates[i][j] = false; });
        });
    }
    enumerate(0);
    assert.equal(analysis.worlds, worlds);
    own.hand.forEach((card, i) => {
        const value = analysis.moves.find(value => value.cardId === card.id)!;
        assert.equal(value.utility, totals[i] / worlds);
        assert.deepEqual(value.dominates, own.hand.filter((_, j) => dominates[i][j]).map(card => card.id));
    });
});

test('an inferior A7 result is repaired with a certificate, and hidden substitutions cannot change it', () => {
    const state = fixture(), actor = state.currentPlayerIndex as 0 | 1;
    const analysis = solveFinalMove(state, actor)!;
    const replacement = certifiedEndgameReplacement(analysis, example.baseline.cardId)!;
    assert.ok(replacement);
    assert.ok(outcome(state, replacement.cardId) > outcome(state, example.baseline.cardId));
    const altered = structuredClone(state);
    const opponent = altered.players[1 - actor];
    for (const row of opponent.board) for (const card of row) if (card?.isHidden) {
        card.rank = 2; card.suit = 'clubs'; card.id = 'private';
    }
    opponent.hand = opponent.hand.map(card => ({ ...card, id: 'private', rank: 2 }));
    altered.deck.reverse();
    assert.deepEqual(solveFinalMove(altered, actor), analysis);
    const params = { ...DEFAULT_AI_PARAMS, policyGeneration: 'a8' as const };
    assert.deepEqual(getBestMove(state, actor, params), getBestMove(altered, actor, params));
    assert.equal(getLastAiDecisionDiagnostics().usedDominanceOverride, true);
    assert.ok(getLastAiDecisionDiagnostics().exactEndgameWorlds > 0);
    assert.equal(solveFinalMove(state, actor, -1), null);
    const early = structuredClone(state);
    const filledColumn = early.players[actor].board[2].findIndex(card => card !== null);
    early.players[actor].board[2][filledColumn] = null;
    assert.equal(solveFinalMove(early, actor), null);
});

test('a final opponent reply requires a forced win, not just pointwise dominance', () => {
    const values = [
        { cardId: 'base', colIndex: 0, utility: 0, scoreDifference: 0, dominates: ['base'], minimumUtility: -1 },
        { cardId: 'better', colIndex: 0, utility: 0.5, scoreDifference: 1, dominates: ['base', 'better'], minimumUtility: -1 },
    ];
    assert.equal(certifiedEndgameReplacement({ moves: values, worlds: 2, opponentCanRespond: true }, 'base'), undefined);
    assert.equal(certifiedEndgameReplacement({ moves: values, worlds: 2, opponentCanRespond: false }, 'base')?.cardId, 'better');
    values[1].minimumUtility = 1;
    assert.equal(certifiedEndgameReplacement({ moves: values, worlds: 2, opponentCanRespond: true }, 'base')?.cardId, 'better');
});

test('a certified forced win survives every unseen reply under the real scoring rules', () => {
    const state = structuredClone(replyExample.state) as GameState;
    const actor = state.currentPlayerIndex as 0 | 1;
    const own = state.players[actor], opponent = state.players[1 - actor];
    const analysis = solveFinalMove(state, actor)!;
    assert.equal(analysis.opponentCanRespond, true);
    const replacement = certifiedEndgameReplacement(analysis, replyExample.baseline.cardId)!;
    assert.equal(replacement.minimumUtility, 1);
    const known = new Set([...own.hand, ...own.board.flat(), ...opponent.board.flat().filter(card => !card?.isHidden)]
        .filter((card): card is Card => card !== null).map(card => card.id));
    const unseen = createDeck().filter(card => !known.has(card.id));
    const positions: Array<[number, number]> = [];
    opponent.board.forEach((row, r) => row.forEach((card, c) => {
        if (card === null || card.isHidden) positions.push([r, c]);
    }));
    const chosen = new Set<string>();
    let worlds = 0;
    function enumerate(slot: number) {
        if (slot < positions.length) {
            const [row, column] = positions[slot];
            for (const card of unseen) if (!chosen.has(card.id)) {
                chosen.add(card.id); opponent.board[row][column] = { ...card, isHidden: true };
                enumerate(slot + 1); chosen.delete(card.id);
            }
            return;
        }
        worlds++;
        // The final draw has no scoring effect; all possible opponent placements are already filled.
        assert.equal(outcome(state, replacement.cardId), 1);
    }
    enumerate(0);
    assert.equal(worlds, analysis.worlds);
});

test('royal flush precedence and ordinary X scores match the reducer for both seats', () => {
    for (const actor of [0, 1] as const) {
        const deck = createDeck();
        const used = new Set<string>();
        const take = (rank?: number, suit?: string): Card => {
            const card = deck.find(card => !used.has(card.id) && (rank === undefined || card.rank === rank) && (!suit || card.suit === suit))!;
            used.add(card.id); return card;
        };
        const ownX = [10, 11, 12, 13].map(rank => take(rank, 'hearts'));
        const winningCard = take(14, 'hearts');
        const opponentX = [10, 11, 12, 13, 14].map(rank => take(rank, 'spades'));
        const state = fixture();
        state.currentPlayerIndex = actor;
        state.players[actor].board = [Array.from({ length: 5 }, () => take()), Array.from({ length: 5 }, () => take()), [...ownX, null]];
        state.players[1 - actor].board = [Array.from({ length: 5 }, () => take()), Array.from({ length: 5 }, () => take()), opponentX];
        state.players[actor].hand = [winningCard, take(), take()];
        state.players[1 - actor].hand = [take(), take()];
        state.deck = deck.filter(card => !used.has(card.id));
        const result = solveFinalMove(state, actor)!;
        for (const value of result.moves) assert.equal(value.utility, outcome(state, value.cardId));
        assert.equal(result.moves.find(value => value.cardId === winningCard.id)?.utility, actor === 0 ? 1 : -1);
    }
});
