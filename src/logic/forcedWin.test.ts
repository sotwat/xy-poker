import assert from 'node:assert/strict';
import test from 'node:test';
import example from './fixtures/endgame.json';
import forcedExample from './fixtures/forced-win.json';
import heldoutExample from './fixtures/forced-win-holdout.json';
import { DEFAULT_AI_PARAMS, getBestMove, getLastAiDecisionDiagnostics } from './ai';
import { createDeck } from './deck';
import { continueForcedWinPlan, findForcedWinPlan, type ForcedWinPlan } from './forcedWin';
import { gameReducer } from './game';
import type { Card, GameState } from './types';

function fixture(remaining = 2): GameState {
    const state = structuredClone(example.state) as GameState;
    const own = state.players[state.currentPlayerIndex];
    for (let count = 1; count < remaining; count++) {
        const column = own.board[2].findIndex(Boolean);
        own.hand.push(own.board[2][column]!);
        own.board[2][column] = null;
    }
    return state;
}

function verifyAllCompletions(state: GameState, plan: ForcedWinPlan) {
    const actor = plan.playerIndex, own = state.players[actor], opponent = state.players[1 - actor];
    const used = new Set([...own.hand, ...own.board.flat(), ...opponent.board.flat().filter(card => !card?.isHidden)]
        .filter((card): card is Card => card !== null).map(card => card.id));
    const unseen = createDeck().filter(card => !used.has(card.id));
    const positions: Array<[number, number]> = [];
    opponent.board.forEach((row, r) => row.forEach((card, c) => {
        if (!card || card.isHidden) positions.push([r, c]);
    }));
    for (const move of plan.moves) own.board[move.row][move.colIndex] = own.hand.find(card => card.id === move.cardId)!;
    const chosen = new Set<string>();
    let worlds = 0, minimum = Infinity;
    function enumerate(slot: number) {
        if (slot < positions.length) {
            const [row, col] = positions[slot];
            for (const card of unseen) if (!chosen.has(card.id)) {
                chosen.add(card.id);
                opponent.board[row][col] = card;
                enumerate(slot + 1);
                chosen.delete(card.id);
            }
            return;
        }
        const ended = gameReducer({ ...state, phase: 'scoring' }, { type: 'CALCULATE_SCORE' });
        assert.equal(ended.phase, 'ended');
        assert.equal(ended.winner, actor === 0 ? 'p1' : 'p2');
        const margin = ended.players[actor].score - ended.players[1 - actor].score;
        if (plan.scoreLowerBound !== null) assert.ok(margin >= plan.scoreLowerBound);
        minimum = Math.min(minimum, margin);
        worlds++;
    }
    enumerate(0);
    assert.ok(worlds > 0);
    return minimum;
}

test('two- and three-move bounds hold for every hidden completion, in both seats', () => {
    for (const remaining of [2, 3]) for (const actor of [0, 1] as const) {
        const state = fixture(remaining);
        if (state.currentPlayerIndex !== actor) state.players.reverse();
        state.currentPlayerIndex = actor;
        state.players[0].id = 'p1'; state.players[1].id = 'p2';
        const plan = findForcedWinPlan(state, actor)!;
        assert.ok(plan);
        assert.equal(plan.moves.length, remaining);
        verifyAllCompletions(state, plan);
    }
});

test('the recorded three-move win survives every possible opponent completion', () => {
    const state = structuredClone(forcedExample.state) as GameState;
    const plan = findForcedWinPlan(state, state.currentPlayerIndex as 0 | 1)!;
    assert.equal(plan.moves.length, 3);
    assert.equal(plan.scoreLowerBound, 1);
    assert.ok(verifyAllCompletions(state, plan) >= 1);
});

test('A9 wins the recorded A8 loss and retains the plan through timeout fallbacks', () => {
    for (const record of [forcedExample, heldoutExample]) for (const generation of ['a8', 'a9'] as const) {
        let state = structuredClone(record.state) as GameState;
        const actor = state.currentPlayerIndex;
        const planLength = state.players[actor].board.flat().filter(card => card === null).length;
        let ownMoves = 0;
        while (state.phase === 'playing') {
            const ownTurn = state.currentPlayerIndex === actor;
            const move = getBestMove(state, state.currentPlayerIndex, {
                ...DEFAULT_AI_PARAMS, policyGeneration: ownTurn ? generation : 'a8',
                timeBudgetMs: generation === 'a9' && ownTurn && ownMoves > 0 ? 1 : 2000,
            });
            if (ownTurn && generation === 'a9') {
                assert.equal(getLastAiDecisionDiagnostics().forcedWinPlanLength, planLength);
                assert.equal(getLastAiDecisionDiagnostics().usedForcedWinContinuation, ownMoves > 0);
            }
            if (ownTurn) ownMoves++;
            const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
            assert.notEqual(next, state);
            state = next;
        }
        state = gameReducer(state, { type: 'CALCULATE_SCORE' });
        assert.equal(state.winner, generation === 'a9' ? (actor === 0 ? 'p1' : 'p2') : record.a8Winner);
    }
});

function straightVersusFlush(): GameState {
    const state = fixture();
    const cards = new Map(createDeck().map(card => [card.id, card]));
    const take = (id: string) => {
        const card = cards.get(id)!;
        assert.ok(card, `Duplicate card: ${id}`);
        cards.delete(id);
        return card;
    };
    state.currentPlayerIndex = 0;
    state.players[0].board = [
        [9, 10, 11, 12, 13].map(rank => take(`hearts-${rank}`)),
        [9, 10, 11, 12, 13].map(rank => take(`diamonds-${rank}`)),
        [take('clubs-9'), take('clubs-10'), take('spades-11'), null, null],
    ];
    state.players[0].hand = ['clubs-12', 'clubs-13', 'hearts-5'].map(take);
    state.players[1].board = [
        [2, 3, 4, 6, 7].map(rank => take(`clubs-${rank}`)),
        ['diamonds-4', 'diamonds-6', 'diamonds-7', 'spades-2', 'spades-3'].map(take),
        [take('hearts-2'), take('hearts-3'), take('hearts-4'), null, null],
    ];
    state.players[1].hand = ['spades-5', 'spades-6', 'spades-7'].map(take);
    state.players.forEach(player => { player.dice = [1, 1, 1, 1, 1]; player.hiddenCardsCount = 0; });
    state.deck = [...cards.values()];
    return state;
}

test('X bounds use actual points: an opposing Straight is worse than a Flush', () => {
    const state = straightVersusFlush();
    const plan = findForcedWinPlan(state, 0)!;
    assert.ok(plan);
    assert.equal(plan.scoreLowerBound, 6);
    assert.equal(verifyAllCompletions(state, plan), 6);
});

test('a saved plan survives arbitrary reply/draws and a one-millisecond continuation budget', () => {
    let state = straightVersusFlush();
    const params = { ...DEFAULT_AI_PARAMS, policyGeneration: 'a9' as const, mcSimulations: 1, timeBudgetMs: 2000 };
    const first = getBestMove(state, 0, params);
    assert.equal(getLastAiDecisionDiagnostics().forcedWinPlanLength, 2);
    state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: first });
    state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId: 'spades-5', colIndex: 3, isHidden: true } });
    const second = getBestMove(state, 0, { ...params, timeBudgetMs: 1 });
    assert.equal(getLastAiDecisionDiagnostics().usedForcedWinContinuation, true);
    state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: second });
    state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId: 'spades-6', colIndex: 4, isHidden: false } });
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    assert.equal(state.winner, 'p1');
});

test('plans ignore private identities and reject changes outside their proven domain', () => {
    const state = fixture(), actor = state.currentPlayerIndex as 0 | 1;
    const plan = findForcedWinPlan(state, actor)!;
    const altered = structuredClone(state), opponent = altered.players[1 - actor];
    for (const row of opponent.board) for (const card of row) if (card?.isHidden) {
        card.id = 'private'; card.rank = 2; card.suit = 'clubs';
    }
    opponent.hand.reverse(); altered.deck.reverse();
    assert.deepEqual(findForcedWinPlan(altered, actor), plan);
    assert.deepEqual(continueForcedWinPlan(altered, plan), plan.moves[0]);
    const changedDice = structuredClone(state); changedDice.players[0].dice[0]++;
    assert.equal(continueForcedWinPlan(changedDice, plan), null);
    const missingCard = structuredClone(state);
    missingCard.players[actor].hand = missingCard.players[actor].hand.filter(card => card.id !== plan.moves[1].cardId);
    assert.equal(continueForcedWinPlan(missingCard, plan), null);
    const changedBoard = structuredClone(state); changedBoard.players[actor].board[0][0] = null;
    assert.equal(continueForcedWinPlan(changedBoard, plan), null);
    const changedOpponent = structuredClone(state);
    const publicRow = changedOpponent.players[1 - actor].board.find(row => row.some(card => card && !card.isHidden))!;
    publicRow[publicRow.findIndex(card => card && !card.isHidden)] = null;
    assert.equal(continueForcedWinPlan(changedOpponent, plan), null);
});

test('expired and partially computed certificates are discarded', t => {
    const state = fixture(), actor = state.currentPlayerIndex as 0 | 1;
    assert.equal(findForcedWinPlan(state, actor, -1), null);
    let calls = 0;
    t.mock.method(performance, 'now', () => ++calls < 4 ? 0 : 100);
    assert.equal(findForcedWinPlan(state, actor, 50), null);
    assert.ok(calls >= 4);
});

test('multi-move royal certificates respect Player 1 precedence for either seat', () => {
    for (const actor of [0, 1] as const) {
        const state = fixture(), cards = createDeck();
        const take = (rank?: number, suit?: string) => cards.splice(cards.findIndex(card =>
            (rank === undefined || card.rank === rank) && (!suit || card.suit === suit)), 1)[0];
        const ownX = [10, 11, 12].map(rank => take(rank, 'hearts'));
        const ownHand = [13, 14].map(rank => take(rank, 'hearts'));
        const opponentX = [10, 11, 12, 13].map(rank => take(rank, 'spades'));
        state.currentPlayerIndex = actor;
        state.players[actor].board = [Array.from({ length: 5 }, () => take()), Array.from({ length: 5 }, () => take()), [...ownX, null, null]];
        state.players[actor].hand = ownHand;
        state.players[1 - actor].board = [Array.from({ length: 5 }, () => take()), Array.from({ length: 5 }, () => take()), [...opponentX, null]];
        state.players[1 - actor].hand = [];
        state.deck = cards;
        const plan = findForcedWinPlan(state, actor);
        if (actor === 0) {
            assert.ok(plan?.royalWin);
            verifyAllCompletions(state, plan);
        } else assert.equal(plan, null);
    }
});
