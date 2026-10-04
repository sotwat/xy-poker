import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { evaluateXHand, evaluateYHand } from '../src/logic/evaluation';
import { calculateXHandScores, SCORING_RULES_VERSION } from '../src/logic/scoring';
import { gameReducer } from '../src/logic/game';
import { findIndependentForcedWinPlan } from '../src/logic/forcedWin';
import { findJointForcedWinPlan } from '../src/logic/jointForcedWin';
import type { Card, GameState, YHandResult } from '../src/logic/types';

function compare(a: YHandResult, b: YHandResult) {
    if (a.rankValue !== b.rankValue) return Math.sign(a.rankValue - b.rankValue);
    for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
        const difference = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
        if (difference) return Math.sign(difference);
    }
    return 0;
}
const input = process.argv.find(arg => arg.startsWith('--input='))?.slice(8);
const raw = readFileSync(input ?? new URL('../src/logic/fixtures/joint-forced-win.json', import.meta.url), 'utf8');
const state = JSON.parse(raw).state as GameState, actor = state.currentPlayerIndex as 0 | 1;
assert.equal(findIndependentForcedWinPlan(state, actor), null);
const plan = findJointForcedWinPlan(state, actor)!;
assert.ok(plan && !plan.royalWin);
const own = state.players[actor], opponent = state.players[1 - actor];
const known = new Set([...own.hand, ...own.board.flat(), ...opponent.board.flat().filter(card => !card?.isHidden)]
    .filter((card): card is Card => card !== null).map(card => card.id));
const unseen = createDeck().filter(card => !known.has(card.id));
const positions: Array<[number, number]> = [];
opponent.board.forEach((row, r) => row.forEach((card, c) => {
    if (!card || card.isHidden) positions.push([r, c]);
}));
for (const move of plan.moves) own.board[move.row][move.colIndex] = own.hand.find(card => card.id === move.cardId)!;
const ownX = evaluateXHand(own.board[2] as Card[]);
const ownY = own.board[0].map((_, column) => evaluateYHand(own.board.map(row => row[column]!), 1));
const used = new Set<string>(), minimumY = Array(5).fill(Infinity);
let minimumX = Infinity, minimumMargin = Infinity, leaves = 0;
let worstBoard: (string | null)[][] | null = null;
function enumerate(slot: number) {
    if (slot < positions.length) {
        const [row, column] = positions[slot];
        for (const card of unseen) if (!used.has(card.id)) {
            used.add(card.id);
            opponent.board[row][column] = card;
            enumerate(slot + 1);
            used.delete(card.id);
        }
        return;
    }
    const opponentX = evaluateXHand(opponent.board[2] as Card[]);
    assert.notEqual(opponentX.type, 'RoyalFlush');
    const x = calculateXHandScores(ownX, opponentX), xMargin = x.p1Score - x.p2Score;
    const yMargins = ownY.map((result, column) => state.players[0].dice[column]
        * compare(result, evaluateYHand(opponent.board.map(row => row[column]!), 1)));
    const margin = yMargins.reduce((sum, value) => sum + value, xMargin);
    const scored = gameReducer({ ...state, phase: 'scoring' }, { type: 'CALCULATE_SCORE' });
    assert.equal(scored.winner, actor === 0 ? 'p1' : 'p2');
    assert.equal(scored.players[actor].score - scored.players[1 - actor].score, margin);
    if (margin < minimumMargin) {
        minimumMargin = margin;
        worstBoard = opponent.board.map(row => row.map(card => card?.id ?? null));
    }
    minimumX = Math.min(minimumX, xMargin);
    yMargins.forEach((value, column) => minimumY[column] = Math.min(minimumY[column], value));
    leaves++;
}
enumerate(0);
assert.equal(leaves, plan.expectedOpponentCompletions);
assert.equal(minimumMargin, plan.scoreLowerBound);
const result = { generatedAt: new Date().toISOString(), fixtureHash: createHash('sha256').update(raw).digest('hex'),
    scoringRulesVersion: SCORING_RULES_VERSION, actor, plan, leaves,
    independentMinimumY: minimumY, independentMinimumX: minimumX,
    independentlyRelaxedMargin: minimumY.reduce((sum, value) => sum + value, minimumX),
    jointMinimumMargin: minimumMargin, worstBoard,
    scope: 'Selected non-Royal fixture, simultaneous reducer score audit over every labelled injective completion.' };
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? 'gto_joint_fixture_audit.json';
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
