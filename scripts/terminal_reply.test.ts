import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import type { Card, GameState } from '../src/logic/types';
import { chooseTerminalReply, setTerminalReplyEnabled, terminalPayoff, terminalReplyMetrics, terminalReplyView } from './terminal_reply';

function rng(seed: number) { let n = seed; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
function terminalState(seed: number) {
    const random = rng(seed), deck = createDeck();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const first = seed % 2;
    let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck: deck, initialDice: [6, 4, 3, 2, 1], startingPlayer: first } });
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: first } });
    for (let i = 0; i < 29; i++) {
        const own = state.players[state.currentPlayerIndex], columns = own.board[2].flatMap((c, col) => c ? [] : [col]);
        const colIndex = columns[Math.floor(random() * columns.length)], cardId = own.hand[Math.floor(random() * own.hand.length)].id;
        const isHidden = random() < 0.3 && own.hiddenCardsCount < 3 && own.board.filter(r => r[colIndex]?.isHidden).length < 2;
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId, colIndex, isHidden } });
        assert.notEqual(next, state); state = next;
    }
    return state;
}
function compareToReducer(state: GameState) {
    const actor = state.currentPlayerIndex as 0 | 1, own = state.players[actor];
    for (const card of own.hand) {
        const placed = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId: card.id, colIndex: own.board[2].findIndex(c => !c), isHidden: false } });
        assert.equal(placed.phase, 'scoring');
        const end = gameReducer(placed, { type: 'CALCULATE_SCORE' });
        const value = terminalPayoff(placed.players[actor].board as Card[][], placed.players[1 - actor].board as Card[][], own.dice, actor);
        assert.equal(value.utility, end.winner === 'draw' ? 0 : end.winner === own.id ? 1 : -1);
        assert.equal(value.margin, end.players[actor].score - end.players[1 - actor].score);
    }
}
test('Terminal payoff matches real reducer across 300 random legal final states', () => {
    for (let seed = 100509490; seed < 100509790; seed++) compareToReducer(terminalState(seed));
});
test('Terminal payoff preserves simultaneous royal precedence for either actor', () => {
    const deck = createDeck(), royal = (suit: string) => deck.filter(c => c.suit === suit && c.rank >= 10);
    const p0royal = royal('hearts'), p1royal = royal('spades');
    const used = new Set([...p0royal, ...p1royal].map(c => c.id)), rest = deck.filter(c => !used.has(c.id));
    for (const actor of [0, 1] as const) {
        const state = structuredClone(INITIAL_GAME_STATE);
        state.phase = 'playing'; state.currentPlayerIndex = actor;
        state.players[0].board = [rest.slice(0, 5), rest.slice(5, 10), [...p0royal]];
        state.players[1].board = [rest.slice(10, 15), rest.slice(15, 20), [...p1royal]];
        state.players.forEach(p => { p.dice = [6, 4, 3, 2, 1]; p.score = 0; });
        const card = state.players[actor].board[2][4]!;
        state.players[actor].board[2][4] = null; state.players[actor].hand = [card];
        compareToReducer(state);
    }
});
test('Reply is invariant to private identities, ignores expired computations and reuses only public view', () => {
    const state = terminalState(100509491), actor = state.currentPlayerIndex as 0 | 1;
    const baseline = { cardId: state.players[actor].hand[0].id, colIndex: state.players[actor].board[2].findIndex(c => !c), isHidden: false };
    const changed = structuredClone(state), opponent = changed.players[1 - actor];
    changed.deck.reverse(); opponent.hand.reverse();
    opponent.board = opponent.board.map(r => r.map(c => c?.isHidden ? { ...c, id: 'private-replacement', suit: 'hearts', rank: 14 } : c));
    assert.deepEqual(terminalReplyView(state, actor), terminalReplyView(changed, actor));
    setTerminalReplyEnabled(true); const original = chooseTerminalReply(state, actor, baseline);
    assert.ok(state.players[actor].hand.some(c => c.id === original.cardId));
    setTerminalReplyEnabled(true); assert.deepEqual(chooseTerminalReply(changed, actor, baseline), original);
    assert.deepEqual(chooseTerminalReply(state, actor, baseline), original); assert.equal(terminalReplyMetrics().hits, 1);
    setTerminalReplyEnabled(true); assert.deepEqual(chooseTerminalReply(state, actor, baseline, -1), baseline);
    assert.equal(terminalReplyMetrics().computed, 0); assert.equal(terminalReplyMetrics().timedOut, 1);
    setTerminalReplyEnabled(false); assert.deepEqual(chooseTerminalReply(state, actor, baseline), baseline);
});
