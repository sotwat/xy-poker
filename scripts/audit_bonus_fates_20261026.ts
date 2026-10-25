import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDeck, drawCards } from '../src/logic/deck';
import { evaluateXHand, evaluateYHand } from '../src/logic/evaluation';
import { gameReducer, isValidGameState } from '../src/logic/game';
import { calculateXHandScores } from '../src/logic/scoring';
import type { Card, GameState } from '../src/logic/types';

interface Outcome { moves: number[]; final: GameState; utility: number; score_margin: number }
interface Row {
    group: string; seed: number; mirror: boolean; actor: 0 | 1;
    root: GameState; prefix: number[]; arms: { bonus: number; defer: number };
    outcomes: Record<'bonus' | 'defer', Outcome>;
}
const path = process.argv[2] ?? 'gto_bonus_choice_20261026.json';
const raw = readFileSync(path);
const input = JSON.parse(raw.toString()) as { complete: boolean; rows: Row[] };
assert(input.complete && input.rows.length === 8);
const cards = createDeck();
const checked = (state: GameState) => {
    assert(isValidGameState(state));
    const ids = [...state.deck, ...state.players.flatMap(p => [...p.hand, ...p.board.flat().filter((c): c is Card => c !== null)])].map(c => c.id);
    assert.equal(ids.length, 52); assert.equal(new Set(ids).size, 52);
};
const rows = input.rows.map(row => {
    const targetColumn = Math.floor((row.arms.bonus % 10) / 2);
    const arms = (['bonus', 'defer'] as const).map(mode => {
        const out = row.outcomes[mode];
        let state = row.root;
        checked(state);
        const draws: { seat: number; col: number; card: string; move: number; playedAt: number | null }[] = [];
        for (const [i, a] of out.moves.entries()) {
            const seat = state.currentPlayerIndex;
            const card = cards[Math.floor(a / 10)];
            assert(state.players[seat].hand.some(c => c.id === card.id));
            for (const acquired of draws) {
                if (acquired.seat === seat && acquired.card === card.id) {
                    assert.equal(acquired.playedAt, null); acquired.playedAt = i;
                }
            }
            const col = Math.floor((a % 10) / 2);
            let next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId: card.id, colIndex: col, isHidden: a % 2 === 1 } });
            assert.notEqual(next, state);
            const delta = next.players[seat].bonusesClaimed - state.players[seat].bonusesClaimed;
            assert(delta === 0 || delta === 1);
            if (i === 0) assert.equal(delta, Number(mode === 'bonus'));
            if (delta) {
                const acquired = drawCards(state.deck, 1).drawn;
                assert.equal(acquired.length, 1);
                assert(next.players[seat].hand.some(c => c.id === acquired[0].id));
                draws.push({ seat, col, card: acquired[0].id, move: i, playedAt: null });
            }
            if (next.phase === 'scoring') next = gameReducer(next, { type: 'CALCULATE_SCORE' });
            checked(next); state = next;
        }
        assert.deepEqual(state, out.final); assert.equal(state.phase, 'ended');
        for (const acquired of draws) {
            const used = state.players[acquired.seat].board.flat().some(c => c?.id === acquired.card);
            assert.equal(used, acquired.playedAt !== null);
            if (!used) assert(state.players[acquired.seat].hand.some(c => c.id === acquired.card));
        }
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
            return { col, points, winner, actorWins: winner === row.actor, ranks: hands };
        });
        const xHands = state.players.map(p => evaluateXHand(p.board[2] as Card[]));
        assert(xHands.every(h => h.type !== 'RoyalFlush'));
        const xScores = calculateXHandScores(xHands[0], xHands[1]);
        const x = [xScores.p1Score, xScores.p2Score];
        assert.deepEqual(x.map((v, i) => v + y[i]), state.players.map(p => p.score));
        const utility = state.winner === 'draw' ? 0 : state.winner === state.players[row.actor].id ? 1 : -1;
        assert.equal(utility, out.utility);
        return { mode, x, y, columns, bonusDraws: draws,
            rootBonusPlayedAt: mode === 'bonus' ? draws.find(d => d.move === 0)!.playedAt : null,
            targetColumnBonusOwner: draws.find(d => d.col === targetColumn)?.seat ?? null,
            targetColumnActorWins: columns[targetColumn].actorWins };
    });
    return { group: row.group, seed: row.seed, mirror: row.mirror, actor: row.actor,
        prefix: row.prefix.length, targetColumn, arms };
});
const groups = Object.fromEntries(['selection', 'confirmation'].map(group => {
    const subset = rows.filter(r => r.group === group);
    return [group, { roots: subset.length,
        rootBonusUsed: subset.filter(r => r.arms[0].rootBonusPlayedAt !== null).length,
        targetColumnWins: ['bonus', 'defer'].map((_, i) => subset.filter(r => r.arms[i].targetColumnActorWins).length),
        actorYMargin: ['bonus', 'defer'].map((_, i) => subset.reduce((sum, r) => sum + r.arms[i].y[r.actor] - r.arms[i].y[1-r.actor], 0)),
        actorXMargin: ['bonus', 'defer'].map((_, i) => subset.reduce((sum, r) => sum + r.arms[i].x[r.actor] - r.arms[i].x[1-r.actor], 0)) }];
}));
writeFileSync(process.argv[3] ?? 'gto_bonus_fates_20261026.json', JSON.stringify({
    input_sha256: createHash('sha256').update(raw).digest('hex'),
    scope: 'Post-hoc accounting of existing 16 continuations; no new games, selection or strength evidence',
    productionChanged: false, newAiCalls: 0, groups, rows }, null, 2) + '\n');
console.log(JSON.stringify(groups));
