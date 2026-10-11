import assert from 'node:assert/strict';
import test from 'node:test';
import { lowCountDistribution, predictHiddenSet, scoreHiddenSet } from './hidden_set_calibration';
import { terminalState } from './terminal_reply_fixture';

test('Count probabilities match exhaustive subsets without replacement', () => {
    for (let n = 0; n <= 9; n++) for (let low = 0; low <= n; low++) for (let h = 0; h <= Math.min(n, 3); h++) {
        const counts = Array(h + 1).fill(0) as number[];
        for (let mask = 0; mask < 2 ** n; mask++) {
            const selected = Array.from({ length: n }, (_, i) => i).filter(i => mask & (1 << i));
            if (selected.length === h) counts[selected.filter(i => i < low).length]++;
        }
        const total = counts.reduce((a, b) => a + b, 0), probabilities = lowCountDistribution(n, low, h);
        probabilities.forEach((p, i) => assert.ok(Math.abs(p - counts[i] / total) < 1e-12));
    }
});

test('Forecast is independent of opponent secrets; actual labels are scored separately', () => {
    for (let seed = 1005116001; seed < 1005116031; seed++) {
        const state = terminalState(seed), before = structuredClone(state), actor = state.currentPlayerIndex as 0 | 1;
        const forecast = predictHiddenSet(state, actor), scored = scoreHiddenSet(state, actor);
        assert.ok(forecast && scored);
        assert.ok(scored.actualHiddenIds.every(id => !forecast.knownIds.includes(id)));
        const changed = structuredClone(state);
        changed.deck.reverse(); changed.players[1 - actor].hand.reverse();
        changed.players[1 - actor].board.forEach(row => row.forEach(c => { if (c?.isHidden) { c.id = 'private'; c.rank = 14; c.suit = 'hearts'; } }));
        assert.deepEqual(predictHiddenSet(changed, actor), forecast);
        assert.deepEqual(state, before);
    }
});
