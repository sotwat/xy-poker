import assert from 'node:assert/strict';
import test from 'node:test';
import { terminalState } from './terminal_reply_fixture';
import { actualTerminalValues } from './terminal_range_diagnostic';
import { allocationForecast, outcomeBrier, permutations } from './hidden_allocation';

test('Allocation forecasts preserve privacy and total probability on hidden boards', () => {
    assert.equal(permutations([0, 1, 2]).length, 6); assert.deepEqual(permutations([]), [[]]);
    for (let seed = 1005103001; seed < 1005103021; seed++) {
        const state = terminalState(seed), before = structuredClone(state), actor = state.currentPlayerIndex;
        const card = state.players[actor].hand[0].id, forecast = allocationForecast(state, card, seed, 16);
        const changed = structuredClone(state); changed.deck.reverse(); changed.players[1 - actor].hand.reverse();
        changed.players[1 - actor].board.forEach(r => r.forEach(c => { if (c?.isHidden) { c.id = 'secret'; c.rank = 14; c.suit = 'hearts'; } }));
        assert.deepEqual(allocationForecast(changed, card, seed, 16), forecast);
        assert.deepEqual(state, before);
    }
});

test('Fully visible outcomes match independent reducer with zero Brier loss', () => {
    for (let seed = 1005103021; seed < 1005103051; seed++) {
        const state = terminalState(seed);
        state.players[1 - state.currentPlayerIndex].board.forEach(r => r.forEach(c => { if (c) c.isHidden = false; }));
        for (const actual of actualTerminalValues(state)) {
            const prediction = allocationForecast(state, actual.cardId, seed, 1);
            assert.deepEqual(prediction.uniform, prediction.allocated);
            assert.equal(outcomeBrier(prediction.uniform, actual.utility), 0);
        }
    }
});
