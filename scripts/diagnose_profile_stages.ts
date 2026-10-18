import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
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
const stages = [6, 14, 22];
const profiles = [XY_GTO_A7, XY_GTO_A6, XY_GTO_A4, XY_GTO_A3];
const paths = ['scripts/diagnose_profile_stages.ts', ...['ai', 'game', 'deck', 'gtoPolicy', 'evaluation', 'scoring', 'types'].map(p => `src/logic/${p}.ts`)];
const sourceHashes = Object.fromEntries(paths.map(p => [p, sha(p)]));
function conserved(s: GameState) {
    const cards = [...s.deck, ...s.players.flatMap(p => [...p.hand, ...p.board.flat().filter(c => c !== null)])];
    assert.equal(cards.length, 52); assert.equal(new Set(cards.map(c => c.id)).size, 52);
}
function fixture(seed: number) {
    const random = api.seededRandom(seed), deck = createDeck();
    for (let i = 51; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const dice = Array.from({ length: 5 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => b - a);
    let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck: deck, initialDice: dice, startingPlayer: 0 } });
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
    const moves: Move[] = [], snapshots: { ply: number; state: GameState }[] = [];
    for (let turn = 0; turn < 22; turn++) {
        const own = state.players[state.currentPlayerIndex];
        const cols = own.board[2].flatMap((c, i) => c ? [] : [i]);
        const colIndex = cols[Math.floor(random() * cols.length)];
        const move = { cardId: own.hand[Math.floor(random() * own.hand.length)].id, colIndex,
            isHidden: random() < 0.3 && own.hiddenCardsCount < 3 && own.board.filter(r => r[colIndex]?.isHidden).length < 2 };
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        assert.notEqual(next, state); state = next; conserved(state); moves.push(move);
        if (stages.includes(turn + 1)) snapshots.push({ ply: turn + 1, state });
    }
    return { deck, dice, moves, snapshots };
}
const groups = [];
for (const [phase, seed] of [['selection', 100518501], ['confirmation', 100518502]] as const) {
    const rows: { deal: number; swap: number; ply: number; worlds: { worldSeed: number; state: GameState; moves: Move[] }[] }[] = [], fixtures = [];
    for (let deal = 0; deal < 4; deal++) {
        const dealSeed = (seed + Math.imul(deal, 2654435761)) >>> 0;
        const f = fixture(dealSeed); fixtures.push({ deal, dealSeed, deck: f.deck, dice: f.dice, moves: f.moves });
        for (const snap of f.snapshots) for (const swap of [0, 1]) {
            const state = structuredClone(snap.state);
            if (swap) { state.players = [{ ...state.players[1], id: 'p1' }, { ...state.players[0], id: 'p2' }]; state.currentPlayerIndex = 1; }
            const actor = state.currentPlayerIndex;
            const worlds = Array.from({ length: 4 }, (_, index) => {
                assert.ok(Date.now() < deadline, '60-second diagnostic deadline exceeded');
                const worldSeed = (dealSeed ^ Math.imul(snap.ply, 2246822519) ^ index) >>> 0;
                const world = api.sampleInformationSet(state, 1 - actor, worldSeed); conserved(world);
                const moves = profiles.map(weights => {
                    const move = api.selectRolloutMove(world, actor, 1 - actor,
                        { opponentWeights: weights, opponentTemperature: 0 }, XY_GTO_A7, api.seededRandom(worldSeed ^ 0x524f4c4c));
                    const after = gameReducer(world, { type: 'PLACE_AND_DRAW', payload: move });
                    assert.notEqual(after, world); assert.equal(after.phase, 'playing'); conserved(after);
                    return move;
                });
                return { worldSeed, state: world, moves };
            });
            rows.push({ deal, swap, ply: snap.ply, worlds });
        }
    }
    const summary = stages.map(ply => {
        const worlds = rows.filter(r => r.ply === ply).flatMap(r => r.worlds);
        return { ply, worlds: worlds.length,
            pairDisagreements: [[0, 1], [0, 2], [1, 2], [0, 3], [1, 3], [2, 3]].map(([a, b]) => ({ a, b,
                count: worlds.filter(w => JSON.stringify(w.moves[a]) !== JSON.stringify(w.moves[b])).length })),
            allSame: worlds.filter(w => new Set(w.moves.map(m => JSON.stringify(m))).size === 1).length };
    });
    groups.push({ phase, seed, fixtures, rows, summary });
}
for (const [p, h] of Object.entries(sourceHashes)) assert.equal(sha(p), h);
writeFileSync('gto_profile_stages_20261018.json', JSON.stringify({ kind: 'local-stage-profile-diversity-not-strength',
    startedUtc, endedUtc: new Date().toISOString(), sourceHashes, actualA9Games: 0, decisions: 768, groups }, null, 2), { flag: 'wx' });
console.log(JSON.stringify(groups.map(g => ({ phase: g.phase, seed: g.seed, summary: g.summary }))));
