export interface SymmetricEquilibriumResult {
    averageStrategy: number[];
    iterations: number;
    exploitability: number;
    bestResponseIndex: number;
    bestResponseValues: number[];
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

    return { averageStrategy, iterations, exploitability, bestResponseIndex, bestResponseValues };
}
