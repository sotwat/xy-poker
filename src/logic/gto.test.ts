import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedPopulationConfidence, multiplyMatrixVector, solveSymmetricZeroSum } from './gto';

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

test('the symmetric solver rejects games outside its zero-value domain', () => {
    for (const matrix of [[[1]], [[0, 1], [1, 0]], [[0, NaN], [NaN, 0]], [[0, Infinity], [-Infinity, 0]]]) {
        assert.throws(() => solveSymmetricZeroSum(matrix, 10), /finite|skew-symmetric/);
    }
});

test('weighted cyclic game converges to its independently derived nonuniform equilibrium', () => {
    const matrix = [[0, -1, 2], [1, 0, -3], [-2, 3, 0]];
    // A p = 0 gives p = (3, 2, 1) / 6.
    const result = solveSymmetricZeroSum(matrix, 100_000);
    const expected = [1 / 2, 1 / 3, 1 / 6];
    result.averageStrategy.forEach((probability, index) => {
        assert.ok(Number.isFinite(probability) && probability >= 0);
        assert.ok(Math.abs(probability - expected[index]) < 0.005);
    });
    assert.ok(Math.abs(result.averageStrategy.reduce((sum, p) => sum + p, 0) - 1) < 1e-12);
    const deviations = matrix.map(row => row.reduce((sum, value, index) => sum + value * result.averageStrategy[index], 0));
    assert.equal(result.exploitability, Math.max(...deviations));
    assert.ok(result.exploitability >= 0 && result.exploitability < 0.01);
    const lower = Math.min(...matrix[0].map((_, column) => matrix.reduce(
        (value, row, index) => value + result.averageStrategy[index] * row[column], 0,
    )));
    assert.equal(result.bestResponseLowerValue, lower);
    assert.equal(result.dualityGap, Math.max(...deviations) - lower);
    assert.ok(result.dualityGap < 0.02);
});

test('a dominated policy receives vanishing mass without claiming exact convergence', () => {
    const result = solveSymmetricZeroSum([[0, 1], [-1, 0]], 10_000);
    assert.ok(result.averageStrategy[1] > 0 && result.averageStrategy[1] < 1e-6);
    assert.equal(result.exploitability, result.averageStrategy[1]);
});

test('zero self-play value is insufficient: independent response bounds detect exploitation', () => {
    const matrix = [[0, 1], [-1, 0]];
    const p = [0.5, 0.5];
    const values = multiplyMatrixVector(matrix, p);
    assert.equal(p.reduce((sum, mass, index) => sum + mass * values[index], 0), 0);
    assert.equal(Math.max(...values), 0.5);
    const result = solveSymmetricZeroSum(matrix, 1);
    assert.equal(result.bestResponseUpperValue, 0.5);
    assert.equal(result.bestResponseLowerValue, -0.5);
    assert.equal(result.dualityGap, 1);
});

test('population sampling bound stays positive for zero observed effects and covers selected mixtures', () => {
    const matrix = [[0, 0], [0, 0]];
    const small = boundedPopulationConfidence(matrix, [0.5, 0.5], 100);
    const large = boundedPopulationConfidence(matrix, [0.5, 0.5], 10000);
    assert.ok(small.upper > 0 && small.lower < 0);
    assert.ok(large.upper > 0 && large.upper < small.upper);
    assert.ok(boundedPopulationConfidence(matrix, [1, 0], 100).upper >= small.upper);
    assert.deepEqual(boundedPopulationConfidence([[0]], [1], 1), { cellErrorRadius: 0, upper: 0, lower: 0, gap: 0 });
    assert.throws(() => boundedPopulationConfidence(matrix, [0.5, 0.5], 0), /positive/);
    assert.throws(() => boundedPopulationConfidence(matrix, [0.5, 0.4], 100), /distribution/);
    assert.throws(() => boundedPopulationConfidence([[0, 2], [-2, 0]], [0.5, 0.5], 100), /bounded/);
});
