import assert from 'node:assert/strict';
import type { GameState } from '../src/logic/types';
import { permutations } from './hidden_allocation';
import { completedAllocationRank } from './partial_hidden_allocation';

// Offline conditional diagnostic: the actual hidden SET is deliberately supplied to both models.
export function assignmentSupport(state: GameState, actor: 0 | 1) {
    const opponent = state.players[1 - actor], positions: Array<[number, number]> = [];
    opponent.board.forEach((row, r) => row.forEach((card, c) => { if (card?.isHidden) positions.push([r, c]); }));
    if (positions.length < 2 || positions.length > 3 || !opponent.board[2].some(Boolean) || opponent.board[2].every(Boolean)) return null;
    const cards = positions.map(([r, c]) => opponent.board[r][c]!);
    assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
    const orders = permutations(cards.map((_, i) => i));
    const ranks = orders.map(order => {
        const board = opponent.board.map(row => [...row]);
        positions.forEach(([r, c], i) => { board[r][c] = cards[order[i]]; });
        return completedAllocationRank(board, opponent.dice);
    });
    const best = ranks.reduce((a, b) => { const i = a.findIndex((v, j) => v !== b[j]); return i >= 0 && b[i] > a[i] ? b : a; });
    const selected = ranks.map(rank => rank.every((v, i) => v === best[i]));
    const count = selected.filter(Boolean).length;
    const uniform = orders.map(() => 1 / orders.length), allocated = selected.map(s => s ? 1 / count : 0);
    assert.deepEqual(orders[0], cards.map((_, i) => i));
    const brier = (p: number[]) => p.reduce((s, value, i) => s + (value - (i === 0 ? 1 : 0)) ** 2, 0);
    const uniformBrier = brier(uniform), allocatedBrier = brier(allocated);
    return { positions, actualIds: cards.map(c => c.id), orders, ranks, selected, uniform, allocated, uniformBrier, allocatedBrier,
        difference: allocatedBrier - uniformBrier, excludesActual: !selected[0], narrowed: count < orders.length,
        completedColumns: opponent.board[2].filter(Boolean).length };
}
