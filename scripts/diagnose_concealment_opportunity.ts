import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createDeck } from '../src/logic/deck';
import { gameReducer } from '../src/logic/game';
import { scoreGtoMove, getGtoHideProbability, XY_GTO_A7, XY_GTO_A6, XY_GTO_A4, XY_GTO_A3 } from '../src/logic/gtoPolicy';
import type { GameState } from '../src/logic/types';

const startedUtc = new Date().toISOString(), deadline = Date.now() + 60000;
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const ast = ts.createSourceFile('ai.ts', readFileSync('src/logic/ai.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['sampleInformationSet', 'cloneGameState', 'getRemainingDeck', 'getKnownCards', 'shuffleInPlace', 'seededRandom', 'selectRolloutMove', 'enumeratePlacements'];
const code = names.map(name => {
    const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(node); return node.getText(ast).replace(/^export /, '');
}).join('\n');
type Move = { cardId: string; colIndex: number; isHidden: boolean };
type Profile = { opponentWeights: typeof XY_GTO_A7; opponentTemperature: number };
const api = runInNewContext(ts.transpileModule(`${code}\n({sampleInformationSet,seededRandom,selectRolloutMove});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None },
}).outputText, { structuredClone, createDeck, scoreGtoMove, getGtoHideProbability, XY_GTO_A7 }, { timeout: 1000 }) as {
    sampleInformationSet: (s: GameState, p: number, seed: number) => GameState;
    seededRandom: (seed: number) => () => number;
    selectRolloutMove: (s: GameState, p: number, root: number, profile: Profile, weights: typeof XY_GTO_A7, rng: () => number) => Move;
};

const inputPath = 'gto_profile_stages_20261018.json';
type Source = { groups: { phase: string; seed: number; rows: { deal: number; swap: number; ply: number; worlds: { worldSeed: number; state: GameState; moves: Move[] }[] }[] }[] };
const source: Source = JSON.parse(readFileSync(inputPath, 'utf8'));
const profiles = [XY_GTO_A7, XY_GTO_A6, XY_GTO_A4, XY_GTO_A3];
const paths = [inputPath, 'gto_concealment_continuation_20261019.json', 'scripts/diagnose_concealment_opportunity.ts', ...['ai', 'game', 'deck', 'gtoPolicy', 'evaluation', 'scoring', 'types'].map(p => `src/logic/${p}.ts`)];
const sourceHashes = Object.fromEntries(paths.map(p => [p, sha(p)]));
function play(initial: GameState, first: Move, root: number, profile: number, worldSeed: number, ply: number) {
    let state = structuredClone(initial);
    const moves = [first];
    const before = state;
    state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: first });
    assert.notEqual(state, before);
    for (let turn = ply + 1; state.phase === 'playing'; turn++) {
        assert.ok(Date.now() < deadline, '60-second diagnostic deadline exceeded');
        assert.ok(turn < 30);
        const rng = api.seededRandom((worldSeed ^ Math.imul(turn, 2654435761) ^ 0x48494445) >>> 0);
        const move = api.selectRolloutMove(state, state.currentPlayerIndex, root,
            { opponentWeights: profiles[profile], opponentTemperature: 0 }, XY_GTO_A7, rng);
        if (state.currentPlayerIndex === root) move.isHidden = false;
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        assert.notEqual(next, state); state = next; moves.push(move);
    }
    assert.equal(state.phase, 'scoring');
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    assert.equal(state.phase, 'ended');
    return { moves, winner: state.winner, scores: state.players.map(p => p.score),
        win: state.winner === 'draw' ? 0 : state.winner === `p${root + 1}` ? 1 : -1,
        margin: state.players[root].score - state.players[1 - root].score };
}
const groups = source.groups.map(g => {
    const cases: { rowIndex: number; worldIndex: number; deal: number; swap: number; ply: number; profile: number; root: number; arms: ReturnType<typeof play>[]; firstResponseChanged: boolean; deltaWin: number; deltaMargin: number }[] = [], excluded = [];
    for (const [rowIndex, row] of g.rows.entries()) for (const [worldIndex, world] of row.worlds.entries()) {
        const root = world.state.currentPlayerIndex, own = world.state.players[root], move = world.moves[0];
        if (own.hiddenCardsCount >= 3 || own.board.filter(r => r[move.colIndex]?.isHidden).length >= 2) {
            excluded.push({ rowIndex, worldIndex }); continue;
        }
        const initialArms = [false, true].map(isHidden => gameReducer(world.state,
            { type: 'PLACE_AND_DRAW', payload: { ...move, isHidden } }));
        initialArms.forEach(s => assert.notEqual(s, world.state));
        assert.deepEqual(initialArms[0].deck, initialArms[1].deck);
        assert.deepEqual(initialArms[0].players.map(p => p.hand), initialArms[1].players.map(p => p.hand));
        for (let profile = 0; profile < profiles.length; profile++) {
            const arms = [false, true].map(isHidden => play(world.state, { ...move, isHidden }, root, profile, world.worldSeed, row.ply));
            assert.deepEqual(play(world.state, { ...move, isHidden: false }, root, profile, world.worldSeed, row.ply), arms[0]);
            cases.push({ rowIndex, worldIndex, deal: row.deal, swap: row.swap, ply: row.ply, profile, root, arms,
                firstResponseChanged: JSON.stringify(arms[0].moves[1]) !== JSON.stringify(arms[1].moves[1]),
                deltaWin: arms[1].win - arms[0].win, deltaMargin: arms[1].margin - arms[0].margin });
        }
    }
    const summary = [6, 14, 22].map(ply => {
        const c = cases.filter(c => c.ply === ply);
        return { ply, pairs: c.length, firstResponseChanged: c.filter(c => c.firstResponseChanged).length,
            improved: c.filter(c => c.deltaWin > 0).length, worsened: c.filter(c => c.deltaWin < 0).length,
            unchanged: c.filter(c => c.deltaWin === 0).length,
            sumDeltaWin: c.reduce((s, c) => s + c.deltaWin, 0), sumDeltaMargin: c.reduce((s, c) => s + c.deltaMargin, 0) };
    });
    return { phase: g.phase, seed: g.seed, excluded, cases, summary };
});
for (const [p, h] of Object.entries(sourceHashes)) assert.equal(sha(p), h);
writeFileSync('gto_concealment_opportunity_20261020.json', JSON.stringify({
    kind: 'root-future-public-concealment-opportunity-not-strength', startedUtc, endedUtc: new Date().toISOString(),
    sourceHashes, actualA9Games: 0, groups }, null, 2), { flag: 'wx' });
console.log(JSON.stringify(groups.map(g => ({ phase: g.phase, excluded: g.excluded.length, summary: g.summary }))));
