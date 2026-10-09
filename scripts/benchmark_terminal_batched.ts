import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { DEFAULT_AI_PARAMS, getBestMove } from '../src/logic/ai';
import { setTerminalReplyEnabled, terminalReplyMetrics } from './terminal_reply_batched';
import { terminalReplyView } from './terminal_reply';
import type { Card, GameState } from '../src/logic/types';

const confirmation = process.argv.includes('--confirm');
const seed = confirmation ? 100510102 : 100510101;
const deals = confirmation ? 16 : 8;
const output = process.argv.find(a => a.startsWith('--output='))?.slice(9) ?? `/tmp/xy-terminal-batched-${confirmation ? 'confirmation' : 'selection'}.json`;
const selectionPath = process.argv.find(a => a.startsWith('--selection='))?.slice(12) ?? '/tmp/xy-terminal-batched-selection.json';
const runMinutes = Number(process.argv.find(a => a.startsWith('--run-minutes='))?.slice(14) ?? 17);
assert.ok(runMinutes > 0 && runMinutes <= 25);
const paths = ['scripts/benchmark_terminal_batched.ts', 'scripts/terminal_reply_batched.ts', 'scripts/terminal_reply_batched.test.ts', 'scripts/terminal_reply_fixture.ts', 'scripts/terminal_reply.ts', ...['ai', 'certificateKnowledge', 'game', 'deck', 'gtoPolicy', 'endgame', 'forcedWin', 'jointForcedWin', 'sharedCardProof', 'evaluation', 'scoring'].map(s => `src/logic/${s}.ts`)];
const sourceHashes = Object.fromEntries(paths.map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
type Decision = { actor: number; elapsedMs: number; samples: number; replyCalls: number; changedReplies: number; replyWorlds: number; cacheHits: number; computed: number; timedOut: number; proof: boolean; continuation: boolean };
type Match = { variant: 'candidate' | 'control'; swap: number; dice: number[]; utility: number; scoreDifference: number; decisions: Decision[] };
type Pair = { deal: number; matches: Match[]; difference: number };
function summarize(pairs: Pair[]) {
    const values = pairs.map(p => p.difference), mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length - 1);
    const half = values.length > 1 && variance > 0 ? 1.96 * Math.sqrt(variance / values.length) : null;
    const byVariant = (variant: Match['variant']) => {
        const matches = pairs.flatMap(p => p.matches).filter(m => m.variant === variant);
        const decisions = matches.flatMap(m => m.decisions.filter(d => d.actor === m.swap));
        const allDecisions = matches.flatMap(m => m.decisions);
        return { games: matches.length, wins: matches.filter(m => m.utility === 1).length, losses: matches.filter(m => m.utility === -1).length,
            draws: matches.filter(m => m.utility === 0).length, roleDecisions: decisions.length,
            meanMs: decisions.reduce((s, d) => s + d.elapsedMs, 0) / Math.max(1, decisions.length), maxMs: Math.max(0, ...allDecisions.map(d => d.elapsedMs)),
            meanSamples: decisions.reduce((s, d) => s + d.samples, 0) / Math.max(1, decisions.length),
            changedDecisions: decisions.filter(d => d.changedReplies > 0).length, changedReplies: decisions.reduce((s, d) => s + d.changedReplies, 0), replyCalls: decisions.reduce((s, d) => s + d.replyCalls, 0) };
    };
    return { completedPairs: pairs.length, meanUtilityDifference: mean, normal95: half === null ? null : [mean - half, mean + half], candidate: byVariant('candidate'), control: byVariant('control') };
}
type Result = { seed: number; deals: number; sourceHashes: typeof sourceHashes; pairs: Pair[]; complete: boolean; summary?: ReturnType<typeof summarize>; checks: string[]; protocol: object };
let result: Result = { seed, deals, sourceHashes, pairs: [], complete: false, checks: [], protocol: {
    timeBudgetMs: 1000, requestedSamples: 64, terminalReplyWithinDecisionBudget: true, innerSamples: 8, fullyVisibleSamples: 1,
    change: 'Same 8-world final reply as rejected old candidate, with shared own candidate evaluations and per-world opponent evaluation',
    scope: 'Both simulated players use new final reply when candidate acts; root prior unchanged; actual opponent and control use original A9',
    seats: 'Swap initial hands, candidate role and turn selector; same remaining deck and dice',
    gate: 'Complete selection, positive paired utility difference, terminal replies change. Confirmation lower normal95 >0, all decision times <=1020ms, all checks.',
    productionAdoption: false,
} };
if (existsSync(output)) { result = JSON.parse(readFileSync(output, 'utf8')); assert.deepEqual(result.sourceHashes, sourceHashes); assert.equal(result.seed, seed); assert.equal(result.deals, deals); }
if (confirmation) {
    const selected: Result = JSON.parse(readFileSync(selectionPath, 'utf8'));
    assert.deepEqual(selected.sourceHashes, sourceHashes); assert.equal(selected.seed, 100510101); assert.ok(selected.complete);
    assert.ok(selected.summary!.meanUtilityDifference > 0 && selected.summary!.candidate.changedDecisions > 0);
}
const originalAi = readFileSync('src/logic/ai.ts', 'utf8');
const replyUrl = pathToFileURL(resolve('scripts/terminal_reply_batched.ts')).href;
const temp = mkdtempSync(`${tmpdir()}/xy-terminal-batched-`);
const target = 'const move = selectRolloutMove(state, actor, rootPlayerIndex, profile, rootWeights, random);';
assert.equal(originalAi.split(target).length, 2);
const runtimeSource = `import { chooseTerminalReply } from '${replyUrl}';\n` + originalAi.replace(target,
    'const baseline = selectRolloutMove(state, actor, rootPlayerIndex, profile, rootWeights, random);\n        const move = chooseTerminalReply(state, actor, baseline, deadline);') + `
export function resetResearchMatch() { delete forcedWinPlans[0]; delete forcedWinPlans[1]; }
`;
type Runtime = typeof import('../src/logic/ai') & { resetResearchMatch(): void };
function rng(value: number) { let n = value >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
function save() { for (const p of paths) assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'), sourceHashes[p]); result.summary = summarize(result.pairs); result.complete = result.pairs.length === deals; writeFileSync(`${output}.tmp`, JSON.stringify(result, null, 2) + '\n'); renameSync(`${output}.tmp`, output); }
try {
    function compile(source: string, name: string) {
        const absolute = source.replace(/from '(\.\.?\/[^']+)'/g, (_all, path: string) => `from '${pathToFileURL(resolve('src/logic', `${path}.ts`)).href}'`);
        const js = ts.transpileModule(absolute, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
        writeFileSync(`${temp}/${name}.mjs`, js);
    }
    compile(runtimeSource, 'runtime');
    const runtime = await import(pathToFileURL(`${temp}/runtime.mjs`).href) as Runtime;
    let opening = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck: createDeck(), initialDice: [6, 3, 3, 2, 1], startingPlayer: 0 } });
    opening = gameReducer(opening, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
    runtime.resetResearchMatch();
    const smokeParams = { ...DEFAULT_AI_PARAMS, mcSimulations: 1, timeBudgetMs: 1000 };
    assert.deepEqual(runtime.getBestMove(opening, 0, smokeParams), getBestMove(opening, 0, smokeParams));
    result.checks = ['Disabled terminal reply wrapper equals original A9 on one complete-belief opening decision', 'Original production sources untouched; all source hashes fixed', 'Private identities never enter terminal reply view; each final real candidate view audited on clones; all moves pass real reducer'];
    const runDeadline = performance.now() + runMinutes * 60000;
    function audit(state: GameState, actor: 0 | 1) {
        const changed = structuredClone(state);
        changed.deck.reverse();
        changed.players[1 - actor].hand.reverse();
        changed.players[1 - actor].board = changed.players[1 - actor].board.map(row => row.map(c => c?.isHidden ? { ...c, id: 'private-identity', rank: 14, suit: 'hearts' } : c));
        assert.deepEqual(terminalReplyView(state, actor), terminalReplyView(changed, actor));
    }

    function play(deck: Card[], dice: number[], swap: number, variant: Match['variant']): Match {
        const candidate = swap as 0 | 1; runtime.resetResearchMatch();
        const initialDeck = swap ? [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)] : deck;
        let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck, initialDice: dice, startingPlayer: candidate } });
        const first = runtime.getBestTurnOrder(state, candidate) ? candidate : 1 - candidate;
        state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: first } });
        const decisions: Decision[] = [];
        while (state.phase === 'playing') {
            const actor = state.currentPlayerIndex as 0 | 1, enabled = variant === 'candidate' && actor === candidate;
            if (enabled) audit(state, actor);
            setTerminalReplyEnabled(enabled);
            const start = performance.now();
            const move = runtime.getBestMove(state, actor, { ...DEFAULT_AI_PARAMS, timeBudgetMs: 1000, mcSimulations: 64 });
            const elapsedMs = performance.now() - start, d = runtime.getLastAiDecisionDiagnostics();
            const metrics = terminalReplyMetrics();
            decisions.push({ actor, elapsedMs, samples: d.completedBeliefSamples, replyCalls: metrics.calls, changedReplies: metrics.changed, replyWorlds: metrics.worlds, cacheHits: metrics.hits, computed: metrics.computed, timedOut: metrics.timedOut, proof: d.forcedWinPlanLength > 0, continuation: d.usedForcedWinContinuation });
            const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move }); assert.notEqual(next, state); state = next;
        }
        if (state.phase === 'scoring') state = gameReducer(state, { type: 'CALCULATE_SCORE' }); assert.ok(state.winner);
        return { variant, swap, dice, utility: state.winner === `p${candidate + 1}` ? 1 : state.winner === 'draw' ? 0 : -1,
            scoreDifference: state.players[candidate].score - state.players[1 - candidate].score, decisions };
    }
    for (let deal = result.pairs.length; deal < deals; deal++) {
        if (performance.now() + 125000 >= runDeadline) break;
        const random = rng(seed + Math.imul(deal, 2654435761)), deck = createDeck();
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        const dice = Array.from({ length: 5 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => b - a);
        const matches: Match[] = [];
        for (const variant of (deal % 2 ? ['control', 'candidate'] : ['candidate', 'control']) as Match['variant'][]) for (const swap of [0, 1]) matches.push(play(deck, dice, swap, variant));
        const utility = (variant: Match['variant']) => matches.filter(m => m.variant === variant).reduce((s, m) => s + m.utility, 0) / 2;
        result.pairs.push({ deal, matches, difference: utility('candidate') - utility('control') }); save();
        console.error(`${result.pairs.length}/${deals} paired deals saved; mean difference ${result.summary!.meanUtilityDifference}`);
    }
    save(); console.log(JSON.stringify({ complete: result.complete, summary: result.summary }, null, 2));
} finally { rmSync(temp, { recursive: true, force: true }); }
