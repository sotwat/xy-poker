import assert from 'node:assert/strict';
import test from 'node:test';
import { terminalState } from './terminal_reply_fixture';
import { assignmentSupport } from './assignment_support';

test('Conditional assignment probabilities and Brier losses agree with the closed form', () => {
    let checked = 0, excluded = 0;
    for (let seed = 1005114001; seed < 1005114101; seed++) {
        const state = terminalState(seed), actor = state.currentPlayerIndex as 0 | 1;
        const opponent = state.players[1 - actor];
        const col = opponent.board[2].findIndex(c => c && !c.isHidden);
        assert.ok(col >= 0); opponent.board[2][col] = null;
        const before = structuredClone(state), result = assignmentSupport(state, actor);
        if (!result) continue;
        checked++;
        const n = result.orders.length, k = result.selected.filter(Boolean).length;
        assert.ok(Math.abs(result.uniformBrier - (1 - 1 / n)) < 1e-12);
        assert.ok(Math.abs(result.allocatedBrier - (result.excludesActual ? 1 + 1 / k : 1 - 1 / k)) < 1e-12);
        for (const p of [result.uniform, result.allocated]) assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-12);
        const changed = structuredClone(state);
        changed.deck.reverse(); changed.players[1 - actor].hand.reverse();
        changed.players[actor].board.forEach(row => row.forEach(c => { if (c) { c.rank = 2; c.suit = 'clubs'; } }));
        assert.deepEqual(assignmentSupport(changed, actor), result);
        assert.deepEqual(state, before);
        if (result.excludesActual) excluded++;
    }
    assert.ok(checked > 50); assert.ok(excluded > 0);
});

test('Complete and unstarted opponent boards are outside this partial-board diagnostic', () => {
    const state = terminalState(1005114201), actor = state.currentPlayerIndex as 0 | 1;
    assert.equal(assignmentSupport(state, actor), null);
    state.players[1 - actor].board[2].fill(null);
    assert.equal(assignmentSupport(state, actor), null);
});
