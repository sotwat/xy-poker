export interface SymmetricEquilibriumResult {
    averageStrategy: number[];
    iterations: number;
    exploitability: number;
    bestResponseIndex: number;
    bestResponseValues: number[];
    bestResponseUpperValue: number;
    bestResponseLowerValue: number;
    dualityGap: number;
}

function normalizedPositive(values: number[]): number[] {
    const positive = values.map(value => Math.max(0, value));
    const sum = positive.reduce((total, value) => total + value, 0);
    if (sum === 0) return values.map(() => 1 / values.length);
    return positive.map(value => value / sum);
}

export function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
    if (matrix.length !== vector.length || matrix.some(row => row.length !== vector.length)) {
        throw new Error('The payoff matrix must be square and match the strategy vector.');
    }
    return matrix.map(row => row.reduce((total, value, index) => total + value * vector[index], 0));
}

/** Uniform over all mixtures, including mixtures selected from these observations. */
export function boundedPopulationConfidence(
    matrix: number[][],
    mixture: number[],
    pairedDeals: number,
    alpha = 0.05,
): { cellErrorRadius: number; upper: number; lower: number; gap: number } {
    if (!Number.isSafeInteger(pairedDeals) || pairedDeals <= 0) throw new Error('Paired deals must be positive.');
    if (!(alpha > 0 && alpha < 1)) throw new Error('Alpha must be between zero and one.');
    const n = matrix.length;
    if (n === 0 || mixture.length !== n || matrix.some(row => row.length !== n)) throw new Error('Dimensions must match.');
    if (mixture.some(p => !Number.isFinite(p) || p < 0)
        || Math.abs(mixture.reduce((sum, p) => sum + p, 0) - 1) > 1e-10) throw new Error('Mixture must be a probability distribution.');
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (!Number.isFinite(matrix[i][j]) || Math.abs(matrix[i][j]) > 1
            || matrix[i][j] !== -matrix[j][i]) throw new Error('Payoffs must be bounded and skew-symmetric.');
    }
    const cells = n * (n - 1) / 2;
    const cellErrorRadius = cells ? Math.sqrt(2 * Math.log(2 * cells / alpha) / pairedDeals) : 0;
    const upper = Math.max(...matrix.map((row, i) => row.reduce(
        (value, payoff, j) => value + mixture[j] * (i === j ? 0 : Math.min(1, payoff + cellErrorRadius)), 0,
    )));
    const lower = Math.min(...mixture.map((_, j) => matrix.reduce(
        (value, row, i) => value + mixture[i] * (i === j ? 0 : Math.max(-1, row[j] - cellErrorRadius)), 0,
    )));
    return { cellErrorRadius, upper, lower, gap: upper - lower };
}

/**
 * Regret-matching+ for a symmetric, zero-sum matrix game.
 *
 * XY Poker uses the same policy population for both seats. Its paired payoff
 * matrix is explicitly made skew-symmetric, so the game value is zero and one
 * average strategy can be used for both players.
 */
export function solveSymmetricZeroSum(
    payoffMatrix: number[][],
    iterations = 250_000,
): SymmetricEquilibriumResult {
    if (payoffMatrix.length === 0) throw new Error('At least one strategy is required.');
    if (!Number.isInteger(iterations) || iterations <= 0) throw new Error('Iterations must be positive.');

    const size = payoffMatrix.length;
    if (payoffMatrix.some(row => row.length !== size)) throw new Error('The payoff matrix must be square.');
    for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
            const value = payoffMatrix[row][column];
            if (!Number.isFinite(value)) throw new Error('Payoffs must be finite.');
            if (value !== -payoffMatrix[column][row]) {
                throw new Error('The payoff matrix must be skew-symmetric.');
            }
        }
    }

    const regrets = Array<number>(size).fill(0);
    const strategySum = Array<number>(size).fill(0);

    for (let iteration = 1; iteration <= iterations; iteration++) {
        const strategy = normalizedPositive(regrets);
        const actionValues = multiplyMatrixVector(payoffMatrix, strategy);
        const playedValue = strategy.reduce(
            (total, probability, index) => total + probability * actionValues[index],
            0,
        );

        for (let index = 0; index < size; index++) {
            regrets[index] = Math.max(0, regrets[index] + actionValues[index] - playedValue);
            // Linear averaging suppresses the unstable early uniform iterations.
            strategySum[index] += iteration * strategy[index];
        }
    }

    const totalWeight = strategySum.reduce((total, value) => total + value, 0);
    const averageStrategy = strategySum.map(value => value / totalWeight);
    const bestResponseValues = multiplyMatrixVector(payoffMatrix, averageStrategy);
    const exploitability = Math.max(...bestResponseValues);
    const bestResponseIndex = bestResponseValues.indexOf(exploitability);
    const columnValues = payoffMatrix.map((_, column) => averageStrategy.reduce(
        (total, probability, row) => total + probability * payoffMatrix[row][column], 0,
    ));
    const bestResponseLowerValue = Math.min(...columnValues);

    return { averageStrategy, iterations, exploitability, bestResponseIndex, bestResponseValues,
        bestResponseUpperValue: exploitability, bestResponseLowerValue,
        dualityGap: exploitability - bestResponseLowerValue };
}
