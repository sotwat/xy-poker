import { evaluateXHand, evaluateYHand } from '../src/logic/evaluation';
import { getXHandBaseScore } from '../src/logic/scoring';
import type { Card, GameState } from '../src/logic/types';

let enabled = false;
let metrics = { calls: 0, eligible: 0, changed: 0, assignments: 0, elapsedMs: 0 };
export function setPartialAllocationEnabled(value: boolean) {
    enabled = value;
    metrics = { calls: 0, eligible: 0, changed: 0, assignments: 0, elapsedMs: 0 };
}
export function partialAllocationMetrics() { return { ...metrics }; }
export function completedAllocationRank(board: (Card | null)[][], dice: number[]) {
    const bottom = board[2].filter((c): c is Card => c !== null);
    const x = bottom.length === 5 ? evaluateXHand(bottom) : null;
    const y = dice.reduce((sum, die, col) => {
        const cards = board.map(row => row[col]).filter((c): c is Card => c !== null);
        return sum + (cards.length === 3 ? die * evaluateYHand(cards, 1).rankValue : 0);
    }, 0);
    return [x?.type === 'RoyalFlush' ? 1 : 0, y, x ? getXHandBaseScore(x.type) : 0];
}
const orders = [[[0]], [[0, 1], [1, 0]], [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]];

// The input is already a sampled world. Never pass the real opponent identities here.
export function allocateSampledHidden(state: GameState, actor: 0 | 1, seed: number): GameState {
    if (!enabled) return state;
    metrics.calls++;
    const start = performance.now(), opponent = state.players[1 - actor];
    const positions: Array<[number, number]> = [];
    opponent.board.forEach((row, r) => row.forEach((card, c) => { if (card?.isHidden) positions.push([r, c]); }));
    if (positions.length < 2 || positions.length > 3 || !opponent.board[2].some(Boolean)) { metrics.elapsedMs += performance.now() - start; return state; }
    metrics.eligible++;
    const cards = positions.map(([r, c]) => opponent.board[r][c]!);
    const board = opponent.board.map(row => [...row]);
    let best: number[] | null = null, winners: number[][] = [];
    for (const order of orders[positions.length - 1]) {
        positions.forEach(([r, c], i) => { board[r][c] = cards[order[i]]; });
        const rank = completedAllocationRank(board, opponent.dice);
        const difference = best ? rank.findIndex((value, i) => value !== best![i]) : -1;
        if (!best || (difference >= 0 && rank[difference] > best[difference])) { best = rank; winners = [order]; }
        else if (difference < 0) winners.push(order);
        metrics.assignments++;
    }
    if (winners.length < orders[positions.length - 1].length) {
        let random = seed ^ 0x616c6c6f;
        random = Math.imul(random ^ (random >>> 16), 0x45d9f3b);
        random = Math.imul(random ^ (random >>> 16), 0x45d9f3b);
        const order = winners[((random ^ (random >>> 16)) >>> 0) % winners.length];
        if (order.some((value, i) => value !== i)) {
            positions.forEach(([r, c], i) => { opponent.board[r][c] = cards[order[i]]; });
            metrics.changed++;
        }
    }
    metrics.elapsedMs += performance.now() - start;
    return state;
}
