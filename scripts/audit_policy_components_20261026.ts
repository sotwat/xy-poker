import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { evaluateXHand, evaluateYHand } from '../src/logic/evaluation';
import { gameReducer, isValidGameState } from '../src/logic/game';
import { calculateXHandScores } from '../src/logic/scoring';
import type { Card, GameState } from '../src/logic/types';

interface Outcome { moves: number[]; final: GameState; utility: number; score_margin: number }
interface Row {
    group: string; seed: number; mirror: boolean; actor: 0 | 1;
    root: GameState; outcomes: Record<'learner' | 'teacher', Outcome>;
}
const raw = readFileSync('gto_policy_continuation_20261026.json');
const input = JSON.parse(raw.toString()) as { complete: boolean; rows: Row[] };
assert(input.complete && input.rows.length === 8);
const cards = createDeck();
const check = (state: GameState) => {
    assert(isValidGameState(state));
    const ids = [...state.deck, ...state.players.flatMap(p => [...p.hand, ...p.board.flat().filter((c): c is Card => c !== null)])].map(c => c.id);
    assert.equal(ids.length, 52); assert.equal(new Set(ids).size, 52);
};
const rows = input.rows.map(row => {
    const outcomes = Object.fromEntries((['learner', 'teacher'] as const).map(arm => {
        const out = row.outcomes[arm];
        let state = row.root;
        check(state);
        for (const action of out.moves) {
            const card = cards[Math.floor(action / 10)];
            assert(state.players[state.currentPlayerIndex].hand.some(c => c.id === card.id));
            let next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: {
                cardId: card.id, colIndex: Math.floor((action % 10) / 2), isHidden: action % 2 === 1,
            } });
            assert.notEqual(next, state);
            if (next.phase === 'scoring') next = gameReducer(next, { type: 'CALCULATE_SCORE' });
            check(next); state = next;
        }
        assert.deepEqual(state, out.final); assert.equal(state.phase, 'ended');
        const dice = state.players[0].dice;
        assert.deepEqual(dice, state.players[1].dice);
        const y = [0, 0];
        const columns = dice.map((points, col) => {
            const hands = state.players.map(p => evaluateYHand(p.board.map(r => r[col]) as Card[], points));
            const vectors = hands.map(h => [h.rankValue, ...h.kickers]);
            let comparison = 0;
            for (let k = 0; k < Math.max(...vectors.map(v => v.length)); k++) {
                comparison = (vectors[0][k] ?? 0) - (vectors[1][k] ?? 0);
                if (comparison) break;
            }
            const winner = comparison > 0 ? 0 : comparison < 0 ? 1 : null;
            if (winner !== null) y[winner] += points;
            return { col, points, winner };
        });
        const xHands = state.players.map(p => evaluateXHand(p.board[2] as Card[]));
        assert(xHands.every(h => h.type !== 'RoyalFlush'));
        const xScores = calculateXHandScores(xHands[0], xHands[1]);
        const x = [xScores.p1Score, xScores.p2Score];
        const totals = x.map((v, i) => v + y[i]);
        assert.deepEqual(totals, state.players.map(p => p.score));
        const utility = state.winner === 'draw' ? 0 : state.winner === state.players[row.actor].id ? 1 : -1;
        assert(utility === out.utility);
        assert.equal(totals[row.actor] - totals[1-row.actor], out.score_margin);
        return [arm, { x, y, columns, utility, scoreMargin: out.score_margin }];
    }));
    return { group: row.group, seed: row.seed, mirror: row.mirror, actor: row.actor, outcomes };
});
writeFileSync('gto_policy_components_20261026.json', JSON.stringify({
    input_sha256: createHash('sha256').update(raw).digest('hex'), rows,
    scope: 'Actual reducer and production hand helpers, not an independent hand evaluator',
}, null, 2) + '\n');
console.log(JSON.stringify({ roots: rows.length, continuations: rows.length * 2 }));
