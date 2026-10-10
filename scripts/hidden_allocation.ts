import assert from 'node:assert/strict';
import { createDeck } from '../src/logic/deck';
import { evaluateXHand, evaluateYHand } from '../src/logic/evaluation';
import { getXHandBaseScore } from '../src/logic/scoring';
import type { Card, GameState } from '../src/logic/types';
import { terminalReplyView } from './terminal_reply';
import { prepareTerminalPayoffs } from './terminal_reply_batched';

export function permutations<T>(items: T[]): T[][] {
    if (items.length < 2) return [[...items]];
    return items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest]));
}
export function allocationRank(board: Card[][], dice: number[]) {
    const x = evaluateXHand(board[2]);
    return [x.type === 'RoyalFlush' ? 1 : 0, dice.reduce((sum, die, col) => sum + die * evaluateYHand(board.map(r => r[col]), 1).rankValue, 0), getXHandBaseScore(x.type)];
}
export function allocationForecast(state: GameState, cardId: string, seed: number, samples = 256) {
    const actor = state.currentPlayerIndex as 0 | 1, view = terminalReplyView(state, actor); assert.ok(view);
    assert.ok(Number.isInteger(samples) && samples > 0);
    const card = view.hand.find(c => c.id === cardId); assert.ok(card);
    const column = view.ownBoard[2].findIndex(c => !c);
    const knownCards = [...view.hand, ...view.ownBoard.flat(), ...view.opponentBoard.flat()].filter((c): c is Card => c !== null);
    const known = new Set(knownCards.map(c => c.id)); assert.equal(known.size, knownCards.length);
    const unseen = createDeck().filter(c => !known.has(c.id)), hidden: Array<[number, number]> = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) if (!view.opponentBoard[r][c]) hidden.push([r, c]);
    assert.ok(hidden.length <= 3);
    const orders = permutations(hidden.map((_, i) => i));
    const payoff = prepareTerminalPayoffs(view.ownBoard, [card], column, view.dice, actor);
    const uniform = [0, 0, 0], allocated = [0, 0, 0];
    let n = seed >>> 0, tied = 0, changedSets = 0;
    const random = () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
    for (let sample = 0; sample < samples; sample++) {
        const pool = [...unseen], cards: Card[] = [];
        for (let i = 0; i < hidden.length; i++) { const j = Math.floor(random() * pool.length); cards.push(pool[j]); pool.splice(j, 1); }
        const assignments = orders.map(order => {
            const board = view.opponentBoard.map(r => [...r]) as Card[][];
            hidden.forEach(([r, c], i) => { board[r][c] = cards[order[i]]; });
            const ids: string[] = [...view.hand, ...view.ownBoard.flat().filter((c): c is Card => c !== null), ...board.flat()].map(c => c.id);
            assert.equal(new Set(ids).size, ids.length);
            return { rank: allocationRank(board, view.dice), utility: payoff(board)[0].utility };
        });
        const best = assignments.reduce((a, b) => { const first = a.rank.findIndex((v, i) => v !== b.rank[i]); return first >= 0 && b.rank[first] > a.rank[first] ? b : a; });
        const strongest = assignments.filter(a => a.rank.every((value, i) => value === best.rank[i]));
        if (strongest.length > 1) tied++;
        if (strongest.length < assignments.length) changedSets++;
        for (const a of assignments) uniform[a.utility + 1] += 1 / (samples * assignments.length);
        for (const a of strongest) allocated[a.utility + 1] += 1 / (samples * strongest.length);
    }
    assert.ok(Math.abs(uniform.reduce((s, p) => s + p, 0) - 1) < 1e-10);
    assert.ok(Math.abs(allocated.reduce((s, p) => s + p, 0) - 1) < 1e-10);
    return { uniform, allocated, hidden: hidden.length, samples, permutations: orders.length, tied, changedSets };
}
export function outcomeBrier(probabilities: number[], utility: number) {
    return probabilities.reduce((sum, p, i) => sum + (p - (i === utility + 1 ? 1 : 0)) ** 2, 0);
}
