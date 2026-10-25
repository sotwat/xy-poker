import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluateXHand, evaluateYHand } from '../src/logic/evaluation';
import { calculateXHandScores } from '../src/logic/scoring';
import type { Card, GameState } from '../src/logic/types';

interface InputRow { pair: number; seed: number; swap: boolean; state: GameState }
interface Input {
    input_sha256: string; model_sha256: string; seed: number; simulations: number;
    rows: InputRow[];
}
const input = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Input;
assert.equal(input.rows.length, 100);
const rows = input.rows.map(({ state, ...identity }) => {
    assert.equal(state.phase, 'ended');
    const xHands = state.players.map(p => evaluateXHand(p.board[2] as Card[]));
    assert(xHands.every(h => h.type !== 'RoyalFlush'), 'Royal flush requires special winner accounting');
    const xScores = calculateXHandScores(xHands[0], xHands[1]);
    const x = [xScores.p1Score, xScores.p2Score];
    const dice = state.players[0].dice;
    assert.deepEqual(dice, state.players[1].dice);
    const y = [0, 0];
    const yWins = [0, 0];
    for (let col = 0; col < 5; col++) {
        const hands = state.players.map(p => evaluateYHand(
            p.board.map(row => row[col]) as Card[], dice[col]));
        const a = [hands[0].rankValue, ...hands[0].kickers];
        const b = [hands[1].rankValue, ...hands[1].kickers];
        let comparison = 0;
        for (let k = 0; k < Math.max(a.length, b.length); k++) {
            comparison = (a[k] ?? 0) - (b[k] ?? 0);
            if (comparison) break;
        }
        if (comparison) {
            const winner = comparison > 0 ? 0 : 1;
            y[winner] += dice[col];
            yWins[winner]++;
        }
    }
    const scores = state.players.map(p => p.score);
    assert.deepEqual(x.map((value, i) => value + y[i]), scores);
    return { ...identity, x, y, yWins, scores, modelX: xHands[0].type,
        opponentX: xHands[1].type, modelBonuses: state.players[0].bonusesClaimed,
        opponentBonuses: state.players[1].bonusesClaimed };
});
const groups = Object.fromEntries(['first25deals', 'last25deals'].map((name, index) => {
    const subset = rows.filter(r => (r.pair < 25) === (index === 0));
    return [name, { games: subset.length,
        xPointSum: [0, 1].map(i => subset.reduce((sum, r) => sum + r.x[i], 0)),
        yPointSum: [0, 1].map(i => subset.reduce((sum, r) => sum + r.y[i], 0)),
        xWins: subset.filter(r => r.x[0] > r.x[1]).length,
        yWins: subset.filter(r => r.y[0] > r.y[1]).length,
        bonuses: [subset.reduce((sum, r) => sum + r.modelBonuses, 0),
            subset.reduce((sum, r) => sum + r.opponentBonuses, 0)] }];
}));
const metadata = { input_sha256: input.input_sha256, model_sha256: input.model_sha256,
    seed: input.seed, simulations: input.simulations };
writeFileSync(process.argv[3], JSON.stringify({ ...metadata, games: rows.length, groups, rows,
    newGames: 0, productionChanged: false }, null, 2) + '\n');
