import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import type { Card } from '../src/logic/types';
import * as original from './terminal_reply';
import * as batched from './terminal_reply_batched';
import { terminalState } from './terminal_reply_fixture';

test('Batched values and selected moves match original and real scoring on 600 fresh legal states', () => {
    for (let seed = 100510301; seed < 100510901; seed++) {
        const state = terminalState(seed), actor = state.currentPlayerIndex as 0 | 1;
        if (seed % 3 === 0) state.players[1 - actor].board.forEach(r => r.forEach(c => { if (c) c.isHidden = false; }));
        const own = state.players[actor], colIndex = own.board[2].findIndex(c => !c);
        const before = structuredClone(state);
        const values = batched.prepareTerminalPayoffs(own.board, own.hand, colIndex, own.dice, actor)(state.players[1 - actor].board as Card[][]);
        for (let i = 0; i < own.hand.length; i++) {
            const placed = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId: own.hand[i].id, colIndex, isHidden: false } });
            const end = gameReducer(placed, { type: 'CALCULATE_SCORE' });
            assert.deepEqual(values[i], original.terminalPayoff(placed.players[actor].board as Card[][], placed.players[1 - actor].board as Card[][], own.dice, actor));
            assert.equal(values[i].utility, end.winner === 'draw' ? 0 : end.winner === own.id ? 1 : -1);
            assert.equal(values[i].margin, end.players[actor].score - end.players[1 - actor].score);
        }
        const baseline = { cardId: own.hand[0].id, colIndex, isHidden: false };
        original.setTerminalReplyEnabled(true); batched.setTerminalReplyEnabled(true);
        assert.deepEqual(batched.chooseTerminalReply(state, actor, baseline), original.chooseTerminalReply(state, actor, baseline));
        assert.deepEqual(batched.terminalReplyMetrics(), original.terminalReplyMetrics());
        assert.deepEqual(state, before);
    }
});

test('Batched royal precedence agrees with independent reducer for either seat', () => {
    const deck = createDeck(), royal = (suit: string) => deck.filter(c => c.suit === suit && c.rank >= 10);
    const a = royal('hearts'), b = royal('spades'), used = new Set([...a, ...b].map(c => c.id)), rest = deck.filter(c => !used.has(c.id));
    for (const actor of [0, 1] as const) {
        const state = structuredClone(INITIAL_GAME_STATE);
        state.phase = 'playing'; state.currentPlayerIndex = actor;
        state.players[0].board = [rest.slice(0, 5), rest.slice(5, 10), [...a]];
        state.players[1].board = [rest.slice(10, 15), rest.slice(15, 20), [...b]];
        state.players.forEach(p => { p.dice = [6, 4, 3, 2, 1]; p.score = 0; });
        const own = state.players[actor], card = own.board[2][4]!;
        own.board[2][4] = null; own.hand = [card];
        const value = batched.prepareTerminalPayoffs(own.board, own.hand, 4, own.dice, actor)(state.players[1 - actor].board as Card[][])[0];
        const end = gameReducer(gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId: card.id, colIndex: 4, isHidden: false } }), { type: 'CALCULATE_SCORE' });
        assert.equal(value.utility, end.winner === own.id ? 1 : -1);
        assert.equal(value.margin, end.players[actor].score - end.players[1 - actor].score);
    }
});

test('Batched reply preserves privacy, cache and deadline fallback', () => {
    const state = terminalState(100510305), actor = state.currentPlayerIndex as 0 | 1, own = state.players[actor];
    const baseline = { cardId: own.hand[0].id, colIndex: own.board[2].findIndex(c => !c), isHidden: false };
    batched.setTerminalReplyEnabled(true); const move = batched.chooseTerminalReply(state, actor, baseline);
    const changed = structuredClone(state);
    changed.deck.reverse(); changed.players[1 - actor].hand.reverse();
    changed.players[1 - actor].board.forEach(r => r.forEach(c => { if (c?.isHidden) { c.id = 'secret'; c.rank = 14; c.suit = 'hearts'; } }));
    batched.setTerminalReplyEnabled(true); assert.deepEqual(batched.chooseTerminalReply(changed, actor, baseline), move);
    assert.deepEqual(batched.chooseTerminalReply(state, actor, baseline), move); assert.equal(batched.terminalReplyMetrics().hits, 1);
    batched.setTerminalReplyEnabled(true); assert.deepEqual(batched.chooseTerminalReply(state, actor, baseline, -1), baseline);
    assert.equal(batched.terminalReplyMetrics().timedOut, 1); assert.equal(batched.terminalReplyMetrics().computed, 0);
    batched.setTerminalReplyEnabled(false); assert.deepEqual(batched.chooseTerminalReply(state, actor, baseline), baseline);
});
