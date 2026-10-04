import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { boundedPopulationConfidence, solveSymmetricZeroSum } from '../src/logic/gto';

function linearSolve(coefficients: number[][], rhs: number[]): number[] | null {
    const rows = coefficients.map((row, i) => [...row, rhs[i]]), size = rhs.length;
    for (let column = 0; column < size; column++) {
        let pivot = column;
        for (let row = column + 1; row < size; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
        if (Math.abs(rows[pivot][column]) < 1e-12) return null;
        [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
        const divisor = rows[column][column];
        for (let j = column; j <= size; j++) rows[column][j] /= divisor;
        for (let row = 0; row < size; row++) if (row !== column) {
            const factor = rows[row][column];
            for (let j = column; j <= size; j++) rows[row][j] -= factor * rows[column][j];
        }
    }
    return rows.map(row => row[size]);
}
function bounds(matrix: number[][], p: number[]) {
    const rowValues = matrix.map(row => row.reduce((sum, value, j) => sum + value * p[j], 0));
    const columnValues = p.map((_, j) => matrix.reduce((sum, row, i) => sum + p[i] * row[j], 0));
    const upper = Math.max(...rowValues), lower = Math.min(...columnValues);
    return { upper, lower, gap: upper - lower, rowValues, columnValues };
}
function supportEquilibrium(matrix: number[][]) {
    const n = matrix.length;
    assert.ok(n > 0 && n <= 16);
    for (let mask = 1; mask < 2 ** n; mask++) {
        const support = Array.from({ length: n }, (_, i) => i).filter(i => mask & (1 << i));
        const rows = support.map(i => [...support.map(j => matrix[i][j]), -1]);
        rows.push([...support.map(() => 1), 0]);
        const solved = linearSolve(rows, [...support.map(() => 0), 1]);
        if (!solved || solved.slice(0, -1).some(p => p < -1e-10)) continue;
        const p = Array(n).fill(0);
        support.forEach((index, j) => p[index] = solved[j]);
        const response = bounds(matrix, p);
        if (response.gap <= 1e-9) return { p, support, ...response };
    }
    throw new Error('No feasible support equilibrium found within numerical tolerance.');
}
const known = supportEquilibrium([[0, -1, 2], [1, 0, -3], [-2, 3, 0]]);
known.p.forEach((p, i) => assert.ok(Math.abs(p - [1 / 2, 1 / 3, 1 / 6][i]) < 1e-10));
const sourcePath = process.argv.find(arg => arg.startsWith('--input='))?.slice(8) ?? 'gto_solution.json';
const outputPath = process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? 'gto_matrix_audit.json';
const stored = JSON.parse(readFileSync(sourcePath, 'utf8'));
const matrix = (stored.numericalCertificate?.payoffMatrix ?? stored.payoffMatrix) as number[][];
const lp = supportEquilibrium(matrix);
const convergence = [100, 1000, 10000, 100000, 300000].map(iterations => {
    const result = solveSymmetricZeroSum(matrix, iterations), independent = bounds(matrix, result.averageStrategy);
    assert.equal(result.exploitability, independent.upper);
    assert.equal(result.dualityGap, independent.gap);
    return { iterations, ...independent };
});
const storedP = stored.numericalCertificate?.mixture
    ?? stored.strategies.map((entry: { equilibriumProbability: number }) => entry.equilibriumProbability);
const sum = storedP.reduce((s: number, p: number) => s + p, 0);
const result = { generatedAt: new Date().toISOString(), sourcePath, sourceGeneratedAt: stored.generatedAt,
    size: matrix.length, payoffUnits: '+1 win / 0 draw / -1 loss',
    method: 'Independent support enumeration with Gaussian elimination and direct best-response inequalities',
    linearProgrammingCertificate: lp, convergence,
    storedStrategy: { sum, precision: stored.numericalCertificate ? 'unrounded' : 'rounded legacy output',
        bounds: bounds(matrix, storedP.map((p: number) => p / sum)) },
    uniformSamplingBound: boundedPopulationConfidence(matrix, storedP.map((p: number) => p / sum), stored.solver.pairedDealsPerCell),
    limits: ['Saved matrix and mixture were rounded; this validates the saved finite empirical game.',
        'A zero population residual does not establish zero true-game exploitability.',
        'Support enumeration uses floating-point tolerances and is capped at 16 strategies.',
        'Historical payoffs precede evaluator corrections; sampling uncertainty is separate from solver residual.'] };
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
