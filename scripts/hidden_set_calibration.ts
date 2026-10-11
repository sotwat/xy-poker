import assert from 'node:assert/strict';
import { createDeck } from '../src/logic/deck';
import type { Card, GameState } from '../src/logic/types';

function choose(n: number, k: number) {
    if (k < 0 || k > n) return 0;
    let value = 1;
    for (let i = 1; i <= Math.min(k, n - k); i++) value = value * (n - i + 1) / i;
    return value;
}
export function lowCountDistribution(population: number, low: number, draws: number) {
    assert.ok([population, low, draws].every(Number.isInteger));
    assert.ok(population >= 0 && low >= 0 && low <= population && draws >= 0 && draws <= population);
    return Array.from({ length: draws + 1 }, (_, k) => choose(low, k) * choose(population - low, draws - k) / choose(population, draws));
}

export function predictHiddenSet(state: GameState, actor: 0 | 1) {
    const own = state.players[actor], opponent = state.players[1 - actor];
    const hiddenCount = opponent.board.flat().filter(c => c?.isHidden).length;
    if (!hiddenCount) return null;
    const known = [...own.hand, ...own.board.flat().filter((c): c is Card => c !== null),
        ...opponent.board.flat().filter((c): c is Card => c !== null && !c.isHidden)];
    const knownIds = known.map(c => c.id), ids = new Set(knownIds);
    assert.equal(ids.size, known.length);
    const unseen = createDeck().filter(c => !ids.has(c.id)), low = unseen.filter(c => c.rank <= 7).length;
    const probabilities = lowCountDistribution(unseen.length, low, hiddenCount);
    assert.ok(Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    return { knownIds, hiddenCount, population: unseen.length, low, probabilities, predictedFraction: low / unseen.length };
}

export function scoreHiddenSet(state: GameState, actor: 0 | 1) {
    const forecast = predictHiddenSet(state, actor);
    if (!forecast) return null;
    const hidden = state.players[1 - actor].board.flat().filter((c): c is Card => !!c?.isHidden);
    const actualLow = hidden.filter(c => c.rank <= 7).length;
    return { forecast, actualHiddenIds: hidden.map(c => c.id), actualLow, difference: actualLow / hidden.length - forecast.predictedFraction,
        brier: forecast.probabilities.reduce((sum, p, i) => sum + (p - (i === actualLow ? 1 : 0)) ** 2, 0) };
}
