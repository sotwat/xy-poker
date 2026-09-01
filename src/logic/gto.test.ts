import assert from 'node:assert/strict';
import test from 'node:test';
import { multiplyMatrixVector, solveSymmetricZeroSum } from './gto';

test('regret matching finds the uniform rock-paper-scissors equilibrium', () => {
    const result = solveSymmetricZeroSum([
        [0, -1, 1],
        [1, 0, -1],
        [-1, 1, 0],
    ], 20_000);

    result.averageStrategy.forEach(probability => {
        assert.ok(Math.abs(probability - 1 / 3) < 0.01);
    });
    assert.ok(result.exploitability < 0.01);
});

test('matrix-vector multiplication rejects incompatible dimensions', () => {
    assert.throws(() => multiplyMatrixVector([[0, 1], [-1, 0]], [1]), /square/);
});
