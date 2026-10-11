import assert from 'node:assert/strict';
import { createDeck } from '../src/logic/deck';
import type { Card, GameState } from '../src/logic/types';

export function predictHiddenRankRelation(state: GameState, actor: 0 | 1) {
    const own = state.players[actor], opponent = state.players[1 - actor];
    const known = [...own.hand, ...own.board.flat().filter((c): c is Card => c !== null),
        ...opponent.board.flat().filter((c): c is Card => c !== null && !c.isHidden)];
    const knownIds = known.map(c => c.id), ids = new Set(knownIds);
    assert.equal(ids.size, known.length);
    const unseen = createDeck().filter(c => !ids.has(c.id));
    const slots = opponent.board.flatMap((row, rowIndex) => row.flatMap((card, col) => {
        if (!card?.isHidden) return [];
        const publicRanks = [...new Set(opponent.board.flatMap(r => r[col] && !r[col]!.isHidden ? [r[col]!.rank] : []))].sort((a, b) => a - b);
        if (!publicRanks.length) return [];
        const matching = unseen.filter(c => publicRanks.includes(c.rank)).length;
        return [{ row: rowIndex, col, publicRanks, matching, probability: matching / unseen.length }];
    }));
    return slots.length ? { knownIds, population: unseen.length, slots, predictedFraction: slots.reduce((s, p) => s + p.probability, 0) / slots.length } : null;
}

export function scoreHiddenRankRelation(state: GameState, actor: 0 | 1) {
    const forecast = predictHiddenRankRelation(state, actor);
    if (!forecast) return null;
    const labels = forecast.slots.map(s => {
        const card = state.players[1 - actor].board[s.row][s.col]!;
        return { id: card.id, rank: card.rank, matches: Number(s.publicRanks.includes(card.rank)) };
    });
    const actualFraction = labels.reduce((s, l) => s + l.matches, 0) / labels.length;
    return { forecast, labels, actualFraction, difference: actualFraction - forecast.predictedFraction,
        brier: labels.reduce((s, l, i) => s + (l.matches - forecast.slots[i].probability) ** 2, 0) / labels.length };
}
