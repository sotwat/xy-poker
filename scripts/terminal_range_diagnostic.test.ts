import assert from 'node:assert/strict';
import test from 'node:test';
import { terminalState } from './terminal_reply_fixture';
import { actualTerminalValues, rangePrediction } from './terminal_range_diagnostic';

test('Fully visible forecasts equal independent actual scoring for every candidate', () => {
    for (let seed = 1005102001; seed < 1005102051; seed++) {
        const state = terminalState(seed);
        state.players[1 - state.currentPlayerIndex].board.forEach(r => r.forEach(c => { if (c) c.isHidden = false; }));
        const before = structuredClone(state), prediction = rangePrediction(state, seed, 8), actual = actualTerminalValues(state);
        prediction.predicted.forEach((p, i) => assert.equal(p.utility, actual[i].utility));
        assert.deepEqual(state, before);
    }
});

test('Hidden identities affect scoring only, never the forecast or action selection', () => {
    for (let seed = 1005102051; seed < 1005102071; seed++) {
        const state = terminalState(seed), changed = structuredClone(state);
        changed.deck.reverse(); const opponent = changed.players[1 - state.currentPlayerIndex]; opponent.hand.reverse();
        opponent.board.forEach(r => r.forEach(c => { if (c?.isHidden) { c.id = 'private'; c.rank = 14; c.suit = 'spades'; } }));
        assert.deepEqual(rangePrediction(state, seed, 16), rangePrediction(changed, seed, 16));
        actualTerminalValues(state);
    }
});
