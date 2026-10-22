import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const [input, active, output] = process.argv.slice(2);
const { evaluateXHand, evaluateYHand } = await import(pathToFileURL(`${active}/src/logic/evaluation.ts`));
const { calculateXHandScores } = await import(pathToFileURL(`${active}/src/logic/scoring.ts`));
const source = JSON.parse(readFileSync(input, 'utf8'));
const rows = source.records.map(({ pair, seed, swap, state }) => {
  const x = state.players.map(p => evaluateXHand(p.board[2]));
  assert.ok(x.every(h => h.type !== 'RoyalFlush'));
  const { p1Score, p2Score } = calculateXHandScores(...x);
  const xs = [p1Score, p2Score];
  const ys = [0, 0];
  const yWins = [0, 0];
  for (let col = 0; col < 5; col++) {
    const dice = state.players[0].dice[col];
    const hands = state.players.map(p => evaluateYHand(p.board.map(row => row[col]), dice));
    const differences = [hands[0].rankValue - hands[1].rankValue,
      ...Array.from({ length: Math.max(...hands.map(h => h.kickers.length)) }, (_, i) =>
        (hands[0].kickers[i] ?? 0) - (hands[1].kickers[i] ?? 0))];
    const first = differences.find(d => d !== 0) ?? 0;
    if (first) {
      const winner = first > 0 ? 0 : 1;
      ys[winner] += dice;
      yWins[winner]++;
    }
  }
  const scores = state.players.map(p => p.score);
  assert.deepEqual(xs.map((v, i) => v + ys[i]), scores);
  assert.equal(state.winner, scores[0] > scores[1] ? 'p1' : scores[0] < scores[1] ? 'p2' : 'draw');
  return { pair, seed, swap, x: xs, y: ys, yWins, scores,
    modelX: x[0].type, opponentX: x[1].type,
    modelBonuses: state.players[0].bonusesClaimed, opponentBonuses: state.players[1].bonusesClaimed };
});
const groups = {};
for (const [name, subset] of [['first25deals', rows.filter(r => r.pair < 25)],
  ['last25deals', rows.filter(r => r.pair >= 25)]]) {
  groups[name] = {
    games: subset.length,
    xPointSum: [0, 1].map(i => subset.reduce((s, r) => s + r.x[i], 0)),
    yPointSum: [0, 1].map(i => subset.reduce((s, r) => s + r.y[i], 0)),
    xWins: subset.filter(r => r.x[0] > r.x[1]).length,
    yWins: subset.filter(r => r.y[0] > r.y[1]).length,
    bonuses: [0, 1].map(i => subset.reduce((s, r) => s + (i ? r.opponentBonuses : r.modelBonuses), 0)),
  };
}
const result = { input_sha256: source.input_sha256, model_sha256: source.model_sha256,
  seed: source.seed, simulations: source.simulations, games: rows.length, groups, rows,
  newGames: 0, productionChanged: false };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(groups));
