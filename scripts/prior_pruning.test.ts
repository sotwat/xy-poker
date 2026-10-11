import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPriorFinalists, setPriorPruningEnabled, priorPruningMetrics } from './prior_pruning';

test('Retains the final blended objective winner discarded by rollout-only pruning', () => {
    setPriorPruningEnabled(true);
    const active = Array.from({ length: 18 }, (_, i) => i);
    const outcomes = [1, ...Array(15).fill(0.91), 0.9, 0] as number[];
    const priors = active.map(i => Number(i === 16));
    const before = structuredClone({ active, outcomes, priors });
    const selected = selectPriorFinalists(active, outcomes, priors, 0.2, 16);
    assert.ok(selected.includes(16)); assert.equal(selected.length, 16); assert.equal(selected[0], 16);
    assert.deepEqual(priorPruningMetrics(), { calls: 1, changedCalls: 1, retainedChanges: 1 });
    assert.deepEqual({ active, outcomes, priors }, before);
});

test('Stable ties, zero prior and every retained score dominate every excluded score', () => {
    assert.deepEqual(selectPriorFinalists([3, 2, 1, 0], [0.5, 0.5, 0.5, 0.5], [1, 1, 1, 1], 0.2, 2), [3, 2]);
    let seed = 1005129201;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let n = 17; n <= 60; n++) {
        const active = Array.from({ length: n }, (_, i) => i), outcomes = active.map(random), priors = active.map(random);
        assert.deepEqual(selectPriorFinalists(active, outcomes, priors, 0, 16), [...active].sort((a, b) => outcomes[b] - outcomes[a]).slice(0, 16));
        const selected = selectPriorFinalists(active, outcomes, priors, 0.2, 16);
        const score = (i: number) => outcomes[i] * 0.8 + priors[i] * 0.2;
        for (const keep of selected) for (const drop of active.filter(i => !selected.includes(i))) assert.ok(score(keep) >= score(drop));
    }
});
