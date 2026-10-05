import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/joint-forced-win.json';
import four from './fixtures/shared-four-proof.json';
import holdout from './fixtures/shared-four-holdout.json';
import { createDeck } from './deck';
import { gameReducer } from './game';
import { findJointForcedWinPlan } from './jointForcedWin';
import type { ForcedWinPlan } from './forcedWin';
import { proveSharedCardPlan, findSharedCardPlan, findSharedForcedWinPlan } from './sharedCardProof';
import { DEFAULT_AI_PARAMS, getBestMove, getLastAiDecisionDiagnostics } from './ai';
import { continueForcedWinPlan, findForcedWinPlan, findIndependentForcedWinPlan } from './forcedWin';
import type { Card, GameState } from './types';

function load(actor: 0 | 1 = 1): GameState {
    const state = structuredClone(fixture.state) as GameState;
    if (state.currentPlayerIndex !== actor) state.players.reverse();
    state.currentPlayerIndex = actor;
    state.players[0].id = 'p1'; state.players[1].id = 'p2';
    return state;
}
function oracle(input: GameState, moves: ForcedWinPlan['moves']) {
    const state = structuredClone(input), actor = state.currentPlayerIndex as 0 | 1;
    const own = state.players[actor], opponent = state.players[1 - actor];
    const known = new Set([...own.hand, ...own.board.flat(), ...opponent.board.flat().filter(c => !c?.isHidden)]
        .filter((c): c is Card => c !== null).map(c => c.id));
    const unseen = createDeck().filter(c => !known.has(c.id));
    const positions: Array<[number, number]> = [];
    opponent.board.forEach((row, r) => row.forEach((card, c) => { if (!card || card.isHidden) positions.push([r, c]); }));
    for (const move of moves) own.board[move.row][move.colIndex] = own.hand.find(c => c.id === move.cardId)!;
    let minimum = Infinity, count = 0, allWin = true;
    const used = new Set<string>();
    const fill = (slot: number) => {
        if (slot < positions.length) {
            const [r, c] = positions[slot];
            for (const card of unseen) if (!used.has(card.id)) {
                used.add(card.id); opponent.board[r][c] = card; fill(slot + 1); used.delete(card.id);
            }
            return;
        }
        const scored = gameReducer({ ...state, phase: 'scoring' }, { type: 'CALCULATE_SCORE' });
        allWin &&= scored.winner === (actor === 0 ? 'p1' : 'p2');
        minimum = Math.min(minimum, scored.players[actor].score - scored.players[1 - actor].score);
        count++;
    };
    fill(0);
    return { allWin, minimum, count };
}

test('column joins cover every labelled completion and agree with the reducer in both seats', () => {
    for (const actor of [0, 1] as const) for (let remaining = 0; remaining <= 3; remaining++) {
        let state = load(actor);
        for (let placed = 0; placed < 3 - remaining; placed++) {
            state.currentPlayerIndex = 1 - actor;
            const opponent = state.players[1 - actor];
            state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: {
                cardId: opponent.hand[0].id, colIndex: opponent.board[2].findIndex(c => c === null), isHidden: false,
            } });
        }
        state.currentPlayerIndex = actor;
        const moves = findJointForcedWinPlan(state, actor)!.moves, before = structuredClone(state);
        const proof = proveSharedCardPlan(state, actor, moves);
        const exact = oracle(state, moves);
        assert.equal(proof.status, 'proved'); assert.equal(exact.allWin, true);
        assert.equal(proof.coveredCompletions, exact.count);
        assert.equal(proof.expectedCompletions, exact.count);
        assert.ok(proof.lowerBound! <= exact.minimum);
        assert.deepEqual(state, before);
        if (remaining === 3) assert.ok(proof.prunedBranches > 0 && proof.visitedLeaves < exact.count);
    }
});

test('a rejected fixed plan supplies an injective counterexample that the reducer scores as a non-win', () => {
    const state = load(), moves = findJointForcedWinPlan(state, 1)!.moves;
    [moves[0].cardId, moves[1].cardId] = [moves[1].cardId, moves[0].cardId];
    const proof = proveSharedCardPlan(state, 1, moves);
    assert.equal(proof.status, 'refuted');
    const cards = new Map(createDeck().map(c => [c.id, c]));
    state.players[0].board = proof.counterexample!.map(row => row.map(id => cards.get(id)!));
    assert.equal(new Set(state.players[0].board.flat().map(c => c!.id)).size, 15);
    for (const move of moves) state.players[1].board[move.row][move.colIndex] = state.players[1].hand.find(c => c.id === move.cardId)!;
    const scored = gameReducer({ ...state, phase: 'scoring' }, { type: 'CALCULATE_SCORE' });
    assert.notEqual(scored.winner, 'p2');
});

test('four unknown cards are covered by disjoint branches and independently scored in every world', () => {
    const state = structuredClone(four.state) as GameState, moves = four.moves as ForcedWinPlan['moves'];
    const proof = proveSharedCardPlan(state, 1, moves), exact = oracle(state, moves);
    assert.equal(findJointForcedWinPlan(state, 1), null);
    assert.equal(proof.status, 'proved'); assert.equal(exact.allWin, true);
    assert.equal(proof.expectedCompletions, 175560);
    assert.equal(proof.coveredCompletions, exact.count);
    assert.ok(proof.lowerBound! <= exact.minimum);
    const changed = structuredClone(state), hidden = changed.players[0].board[0][0]!;
    changed.players[0].board[0][0] = { ...changed.deck[0], isHidden: true };
    changed.deck[0] = { ...hidden, isHidden: false };
    changed.players[0].hand.reverse(); changed.deck.reverse();
    assert.deepEqual(proveSharedCardPlan(changed, 1, moves), proof);
    assert.equal(proveSharedCardPlan(state, 1, [...moves].reverse()).status, 'unsupported');
});

test('partial factor tables or partial branch searches never prove a plan', t => {
    const state = load(), moves = findJointForcedWinPlan(state, 1)!.moves;
    assert.equal(proveSharedCardPlan(state, 1, moves, -1).status, 'timeout');
    for (const cutoff of [3, 40, 120]) {
        let calls = 0;
        const clock = t.mock.method(performance, 'now', () => ++calls < cutoff ? 0 : 100);
        assert.equal(proveSharedCardPlan(state, 1, moves, 50).status, 'timeout');
        clock.mock.restore();
    }
});

test('public knowledge guards and private-card invariance also apply to column joins', () => {
    const state = load(), moves = findJointForcedWinPlan(state, 1)!.moves;
    const expected = proveSharedCardPlan(state, 1, moves);
    const changed = structuredClone(state);
    changed.deck.reverse(); changed.players[0].hand.reverse();
    assert.deepEqual(proveSharedCardPlan(changed, 1, moves), expected);
    changed.players[0].board[0][0] = changed.players[1].hand[0];
    assert.equal(proveSharedCardPlan(changed, 1, moves).status, 'unsupported');
    assert.equal(proveSharedCardPlan(state, 1, [moves[0], moves[0], moves[2]]).status, 'unsupported');
});

test('Royal precedence is applied before any numerical branch bound', () => {
    for (const actor of [0, 1] as const) for (const otherRoyal of [false, true]) {
        const state = load(actor), deck = createDeck();
        const take = (rank?: number, suit?: string) => {
            const i = deck.findIndex(c => (rank === undefined || c.rank === rank) && (!suit || c.suit === suit));
            assert.ok(i >= 0); return deck.splice(i, 1)[0];
        };
        const ownX = [10, 11, 12].map(r => take(r, 'hearts')), held = [13, 14].map(r => take(r, 'hearts'));
        const otherX = [otherRoyal ? 10 : 9, 11, 12, 13].map(r => take(r, 'spades'));
        const reply = take(14, 'spades');
        state.players[actor].board = [Array.from({ length: 5 }, () => take()), Array.from({ length: 5 }, () => take()), [...ownX, null, null]];
        state.players[1 - actor].board = [Array.from({ length: 5 }, () => take()), Array.from({ length: 5 }, () => take()), [...otherX, null]];
        state.players[actor].hand = [...held, ...Array.from({ length: 4 }, () => take())];
        state.players[1 - actor].hand = [reply, ...Array.from({ length: 5 }, () => take())];
        const moves = held.map((card, i) => ({ cardId: card.id, colIndex: 3 + i, row: 2, isHidden: false as const }));
        const proof = proveSharedCardPlan(state, actor, moves), exact = oracle(state, moves);
        assert.equal(proof.status, exact.allWin ? 'proved' : 'refuted');
        assert.equal(exact.allWin, actor === 0 || !otherRoyal);
        if (exact.allWin) assert.equal(proof.lowerBound, null);
    }
});

test('held-plan search reuses exact counterexamples and retains no certificate on expiry', t => {
    const state = structuredClone(four.state) as GameState;
    const search = findSharedCardPlan(state, 1, performance.now() + 1000);
    assert.equal(search.status, 'proved');
    assert.ok(search.counterexampleRejections > 0);
    assert.ok(search.proofCalls < search.candidates);
    assert.equal(findSharedForcedWinPlan(state, 1, -1), null);
    let calls = 0;
    t.mock.method(performance, 'now', () => ++calls < 10 ? 0 : 100);
    const timed = findSharedCardPlan(state, 1, 50);
    assert.equal(timed.status, 'timeout'); assert.equal(timed.moves, null); assert.equal(timed.proof, null);
});

test('the independent holdout is certified, exhaustively scored, and continued through actual AI turns', () => {
    let state = structuredClone(holdout.state) as GameState;
    const actor = state.currentPlayerIndex as 0 | 1;
    assert.equal(findIndependentForcedWinPlan(state, actor), null);
    assert.equal(findJointForcedWinPlan(state, actor), null);
    const plan = findForcedWinPlan(state, actor, performance.now() + 1000)!;
    assert.equal(plan.boundMethod, 'joint-branches');
    assert.equal(plan.fullyCovered, true); assert.equal(plan.fullyEnumerated, undefined);
    const exact = oracle(state, plan.moves);
    assert.equal(exact.allWin, true); assert.equal(exact.count, plan.opponentCompletions);
    assert.ok(plan.scoreLowerBound! <= exact.minimum);
    let ownMoves = 0;
    while (state.phase === 'playing') {
        const ownTurn = state.currentPlayerIndex === actor;
        const move = ownTurn ? getBestMove(state, actor, { ...DEFAULT_AI_PARAMS,
            timeBudgetMs: ownMoves === 0 ? 1000 : 1, mcSimulations: 64 })
            : { cardId: state.players[1 - actor].hand[0].id,
                colIndex: state.players[1 - actor].board[2].findIndex(c => c === null), isHidden: false };
        if (ownTurn) {
            assert.equal(getLastAiDecisionDiagnostics().forcedWinPlanLength, plan.moves.length);
            assert.equal(getLastAiDecisionDiagnostics().usedForcedWinContinuation, ownMoves > 0);
            assert.ok(continueForcedWinPlan(state, plan)); ownMoves++;
        }
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        assert.notEqual(next, state); state = next;
    }
    const scored = gameReducer(state, { type: 'CALCULATE_SCORE' });
    assert.equal(scored.winner, actor === 0 ? 'p1' : 'p2');
});
