import test from 'node:test';
import assert from 'node:assert/strict';
import { resultXpProgress, xpThreshold } from './resultProgress';

test('result EXP crosses levels at the same thresholds as rewards, including multiple levels', () => {
    assert.deepEqual(resultXpProgress(0, 1, 5), { level: 1, fraction: 0 });
    assert.deepEqual(resultXpProgress(149, 1, 5), { level: 1, fraction: 149 / 150 });
    assert.deepEqual(resultXpProgress(150, 1, 5), { level: 2, fraction: 0 });
    assert.deepEqual(resultXpProgress(400, 1, 5), { level: 3, fraction: 0 });
    assert.deepEqual(resultXpProgress(1200, 1, 5), { level: 5, fraction: 0 });
    for (let level = 1; level < 100; level++) {
        const progress = resultXpProgress(xpThreshold(level), 1, level + 1);
        assert.equal(progress.level, level + 1);
        assert.equal(progress.fraction, 0);
    }
});
