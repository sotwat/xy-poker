import assert from 'node:assert/strict';
import test from 'node:test';
import { terminalState } from './terminal_reply_fixture';
import { allocationRank, permutations } from './hidden_allocation';
import { allocateSampledHidden, completedAllocationRank, partialAllocationMetrics, setPartialAllocationEnabled } from './partial_hidden_allocation';
import type { Card } from '../src/logic/types';

test('Partial sampled allocations are exhaustive optima and preserve card ownership, public cards and empty cells', () => {
    let changes = 0;
    for (let seed = 1005112001; seed < 1005112121; seed++) {
        const state = terminalState(seed), actor = state.currentPlayerIndex as 0 | 1;
        const opponent = state.players[1 - actor];
        if (seed % 3) {
            for (let col = 0; col < seed % 5; col++) {
                for (let row = seed % 3; row < 3; row++) {
                    const card = opponent.board[row][col];
                    if (card) { state.deck.push({ ...card, isHidden: false }); if (card.isHidden) opponent.hiddenCardsCount--; }
                    opponent.board[row][col] = null;
                }
            }
        } else assert.deepEqual(completedAllocationRank(opponent.board, opponent.dice), allocationRank(opponent.board as Card[][], opponent.dice));
        const before = structuredClone(state);
        const positions: Array<[number, number]> = [];
        opponent.board.forEach((row, r) => row.forEach((card, c) => { if (card?.isHidden) positions.push([r, c]); }));
        const cards = positions.map(([r, c]) => opponent.board[r][c]!);
        const ranks = permutations(cards).map(order => {
            const board = opponent.board.map(row => [...row]);
            positions.forEach(([r, c], i) => { board[r][c] = order[i]; });
            return completedAllocationRank(board, opponent.dice);
        }).sort((a, b) => { const i = a.findIndex((v, j) => v !== b[j]); return i < 0 ? 0 : b[i] - a[i]; });
        setPartialAllocationEnabled(true);
        allocateSampledHidden(state, actor, seed);
        assert.deepEqual(completedAllocationRank(opponent.board, opponent.dice), ranks[0]);
        changes += partialAllocationMetrics().changed;
        assert.deepEqual(state.deck, before.deck);
        assert.deepEqual(state.players[actor], before.players[actor]);
        assert.deepEqual(opponent.hand, before.players[1 - actor].hand);
        assert.deepEqual(opponent.board.flat().filter(Boolean).map(c => c!.id).sort(), before.players[1 - actor].board.flat().filter(Boolean).map(c => c!.id).sort());
        before.players[1 - actor].board.forEach((row, r) => row.forEach((card, c) => {
            if (!card?.isHidden) assert.deepEqual(opponent.board[r][c], card);
            else assert.equal(opponent.board[r][c]?.isHidden, true);
        }));
        const replay = structuredClone(before);
        allocateSampledHidden(replay, actor, seed); assert.deepEqual(replay, state);
    }
    assert.ok(changes > 0);
});

test('Disabled allocation is identity; equal ranks preserve original assignment', () => {
    const state = terminalState(1005112201), before = structuredClone(state);
    setPartialAllocationEnabled(false);
    assert.equal(allocateSampledHidden(state, state.currentPlayerIndex as 0 | 1, 1), state);
    assert.deepEqual(state, before); assert.equal(partialAllocationMetrics().calls, 0);
    const opponent = state.players[1 - state.currentPlayerIndex];
    opponent.board[2].fill(null);
    const incomplete = structuredClone(state);
    setPartialAllocationEnabled(true);
    allocateSampledHidden(state, state.currentPlayerIndex as 0 | 1, 1);
    assert.deepEqual(state, incomplete);
});
