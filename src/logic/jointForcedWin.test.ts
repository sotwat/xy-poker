import assert from 'node:assert/strict';
import test from 'node:test';
import example from './fixtures/joint-forced-win.json';
import { createDeck } from './deck';
import { DEFAULT_AI_PARAMS, getBestMove, getLastAiDecisionDiagnostics } from './ai';
import { continueForcedWinPlan, findForcedWinPlan, findIndependentForcedWinPlan, type ForcedWinPlan } from './forcedWin';
import { findJointForcedWinPlan } from './jointForcedWin';
import { gameReducer, isValidGameState } from './game';
import type { Card, GameState } from './types';

function fixture(actor = example.state.currentPlayerIndex): GameState {
    const state = structuredClone(example.state) as GameState;
    if (state.currentPlayerIndex !== actor) state.players.reverse();
    state.currentPlayerIndex = actor;
    state.players[0].id = 'p1'; state.players[1].id = 'p2';
    return state;
}

function verifyCompletions(state: GameState, plan: ForcedWinPlan) {
        const actor = plan.playerIndex;
        const own = state.players[actor], opponent = state.players[1 - actor];
        const known = new Set([...own.hand, ...own.board.flat(), ...opponent.board.flat().filter(card => !card?.isHidden)]
            .filter((card): card is Card => card !== null).map(card => card.id));
        const unseen = createDeck().filter(card => !known.has(card.id));
        const positions: Array<[number, number]> = [];
        opponent.board.forEach((row, r) => row.forEach((card, c) => {
            if (!card || card.isHidden) positions.push([r, c]);
        }));
        for (const move of plan.moves) own.board[move.row][move.colIndex] = own.hand.find(card => card.id === move.cardId)!;
        const chosen = new Set<string>();
        let worlds = 0, minimum = Infinity;
        function enumerate(slot: number) {
            if (slot < positions.length) {
                const [row, column] = positions[slot];
                for (const card of unseen) if (!chosen.has(card.id)) {
                    chosen.add(card.id);
                    opponent.board[row][column] = card;
                    enumerate(slot + 1);
                    chosen.delete(card.id);
                }
                return;
            }
            const scored = gameReducer({ ...state, phase: 'scoring' }, { type: 'CALCULATE_SCORE' });
            assert.equal(scored.phase, 'ended');
            assert.equal(scored.winner, actor === 0 ? 'p1' : 'p2');
            const margin = scored.players[actor].score - scored.players[1 - actor].score;
            assert.ok(margin >= plan.scoreLowerBound!);
            minimum = Math.min(minimum, margin);
            worlds++;
        }
        enumerate(0);
        assert.equal(worlds, plan.opponentCompletions);
        assert.equal(worlds, plan.expectedOpponentCompletions);
        assert.equal(plan.fullyEnumerated, true);
        return { worlds, minimum };
}

test('shared-card constraints certify a fixed held plan against every full opposing board, in both seats', () => {
    for (const actor of [0, 1] as const) {
        const state = fixture(actor);
        assert.equal(findIndependentForcedWinPlan(state, actor), null);
        const plan = findForcedWinPlan(state, actor)!;
        assert.equal(plan.boundMethod, 'joint-completions');
        assert.equal(plan.scoreLowerBound, 1);
        assert.deepEqual(verifyCompletions(state, plan), { worlds: 7980, minimum: 1 });
    }
});

test('labelled completion counts and exact reducer outcomes agree for zero through three unknown slots', () => {
    for (let remaining = 0; remaining <= 3; remaining++) {
        let state = fixture();
        const actor = state.currentPlayerIndex as 0 | 1;
        for (let placed = 0; placed < 3 - remaining; placed++) {
            const opponent = state.players[1 - actor];
            // Conditional public-board refinements of the original conservative completion family.
            state.currentPlayerIndex = 1 - actor;
            state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: {
                cardId: opponent.hand[0].id, colIndex: opponent.board[2].findIndex(card => card === null), isHidden: false,
            } });
        }
        state.currentPlayerIndex = actor;
        assert.ok(isValidGameState(state));
        const original = structuredClone(state);
        const plan = findJointForcedWinPlan(state, actor)!;
        assert.ok(plan);
        assert.deepEqual(state, original);
        const verified = verifyCompletions(state, plan);
        assert.equal(verified.worlds, [1, 19, 380, 7980][remaining]);
        assert.ok(verified.minimum >= 1);
    }
});

test('impossible public knowledge cannot shrink the universe into a certificate', () => {
    const collision = fixture(), actor = collision.currentPlayerIndex as 0 | 1;
    collision.players[1 - actor].board[0][0] = collision.players[actor].hand[0];
    assert.equal(findJointForcedWinPlan(collision, actor), null);
    assert.equal(findForcedWinPlan(collision, actor), null);
    const falseIdentity = fixture();
    falseIdentity.players[actor].hand[0].id = 'not-a-card';
    assert.equal(findJointForcedWinPlan(falseIdentity, actor), null);
    assert.equal(findForcedWinPlan(falseIdentity, actor), null);
    const invalidDice = fixture();
    invalidDice.players[0].dice[0] = NaN;
    assert.equal(findJointForcedWinPlan(invalidDice, actor), null);
    assert.equal(findForcedWinPlan(invalidDice, actor), null);
});

test('joint scoring applies Royal precedence before numerical margins for both seats', () => {
    for (const actor of [0, 1] as const) for (const opposingRoyalPossible of [false, true]) {
        const state = fixture(actor), deck = createDeck();
        const take = (rank?: number, suit?: string) => {
            const index = deck.findIndex(card => (rank === undefined || card.rank === rank) && (!suit || card.suit === suit));
            assert.ok(index >= 0);
            return deck.splice(index, 1)[0];
        };
        const x = [10, 11, 12].map(rank => take(rank, 'hearts'));
        const held = [13, 14].map(rank => take(rank, 'hearts'));
        const opposingX = [opposingRoyalPossible ? 10 : 9, 11, 12, 13].map(rank => take(rank, 'spades'));
        const royalReply = take(14, 'spades');
        state.players[actor].board = [Array.from({ length: 5 }, () => take()), Array.from({ length: 5 }, () => take()), [...x, null, null]];
        state.players[1 - actor].board = [Array.from({ length: 5 }, () => take()), Array.from({ length: 5 }, () => take()), [...opposingX, null]];
        state.players[actor].hand = [...held, ...Array.from({ length: 4 }, () => take())];
        state.players[1 - actor].hand = [royalReply, ...Array.from({ length: 5 }, () => take())];
        state.players.forEach(player => { player.dice = [1, 1, 1, 1, 1]; player.hiddenCardsCount = 0; player.bonusesClaimed = 2; });
        state.deck = deck;
        state.turnCount = 28;
        assert.ok(isValidGameState(state));
        const plan = findJointForcedWinPlan(state, actor);
        if (actor === 1 && opposingRoyalPossible) {
            assert.equal(plan, null);
            continue;
        }
        assert.ok(plan?.royalWin);
        assert.equal(plan.scoreLowerBound, null);
        for (const move of plan.moves) state.players[actor].board[move.row][move.colIndex] = state.players[actor].hand.find(card => card.id === move.cardId)!;
        const cards = new Map(createDeck().map(card => [card.id, card]));
        for (const id of plan.unseenIds) {
            state.players[1 - actor].board[2][4] = cards.get(id)!;
            const scored = gameReducer({ ...state, phase: 'scoring' }, { type: 'CALCULATE_SCORE' });
            assert.equal(scored.winner, actor === 0 ? 'p1' : 'p2');
        }
    }
});

test('joint continuation is executed through arbitrary replies with one-millisecond later budgets', () => {
    let state = fixture();
    const actor = state.currentPlayerIndex;
    let ownMoves = 0;
    while (state.phase === 'playing') {
        const ownTurn = state.currentPlayerIndex === actor;
        const move = getBestMove(state, state.currentPlayerIndex, {
            ...DEFAULT_AI_PARAMS, mcSimulations: 1, policyGeneration: ownTurn ? 'a9' : 'a8',
            timeBudgetMs: ownTurn && ownMoves > 0 ? 1 : 2000,
        });
        if (ownTurn) {
            assert.equal(getLastAiDecisionDiagnostics().forcedWinPlanLength, 3);
            assert.equal(getLastAiDecisionDiagnostics().usedForcedWinContinuation, ownMoves > 0);
            ownMoves++;
        }
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        assert.notEqual(next, state);
        state = next;
    }
    const scored = gameReducer(state, { type: 'CALCULATE_SCORE' });
    assert.equal(scored.winner, actor === 0 ? 'p1' : 'p2');
});

test('joint certificates cannot inspect private identities and obey their enumeration cap', () => {
    let state = fixture();
    const actor = state.currentPlayerIndex as 0 | 1;
    const initial = findJointForcedWinPlan(state, actor)!;
    state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: initial.moves[0] });
    const opponent = state.players[1 - actor];
    state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: {
        cardId: opponent.hand[0].id, colIndex: opponent.board[2].findIndex(card => card === null), isHidden: true,
    } });
    assert.ok(isValidGameState(state));
    const plan = findJointForcedWinPlan(state, actor)!;
    assert.ok(plan);
    const altered = structuredClone(state);
    const hiddenRow = altered.players[1 - actor].board.find(row => row.some(card => card?.isHidden))!;
    const column = hiddenRow.findIndex(card => card?.isHidden);
    const oldHidden = hiddenRow[column]!;
    hiddenRow[column] = { ...altered.deck[0], isHidden: true };
    altered.deck[0] = { ...oldHidden, isHidden: false };
    altered.players[1 - actor].hand.reverse(); altered.deck.reverse();
    assert.ok(isValidGameState(altered));
    assert.deepEqual(findJointForcedWinPlan(altered, actor), plan);
    assert.deepEqual(continueForcedWinPlan(altered, plan), plan.moves[0]);
    assert.equal(continueForcedWinPlan(altered, { ...plan, rulesVersion: 'old-scoring' }), null);
    const corruptPublic = structuredClone(state);
    const visible = corruptPublic.players[1 - actor].board.flat().find(card => card && !card.isHidden)!;
    visible.rank = visible.rank === 14 ? 2 : 14;
    assert.equal(continueForcedWinPlan(corruptPublic, plan), null);
    const capped = structuredClone(state);
    const publicRow = capped.players[1 - actor].board.find(row => row.some(card => card && !card.isHidden))!;
    publicRow[publicRow.findIndex(card => card && !card.isHidden)]!.isHidden = true;
    assert.equal(findJointForcedWinPlan(capped, actor), null);
});

test('partial world lists and partial plan verification never become certificates', t => {
    const state = fixture(), actor = state.currentPlayerIndex as 0 | 1;
    assert.equal(findJointForcedWinPlan(state, actor, -1), null);
    let calls = 0;
    const clock = t.mock.method(performance, 'now', () => ++calls < 5 ? 0 : 100);
    assert.equal(findJointForcedWinPlan(state, actor, 50), null);
    clock.mock.restore();
    calls = 0;
    t.mock.method(performance, 'now', () => ++calls < 8000 ? 0 : 100);
    assert.equal(findJointForcedWinPlan(state, actor, 50), null);
    assert.ok(calls >= 8000);
});
