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
import { terminalReplyView } from './terminal_reply';
import { actualTerminalValues, rangePrediction } from './terminal_range_diagnostic';
import type { Card, GameState } from '../src/logic/types';

const confirm = process.argv.includes('--confirm'), seed = confirm ? 100510202 : 100510201, deals = confirm ? 16 : 8;
const output = process.argv.find(s => s.startsWith('--output='))?.slice(9) ?? '/tmp/xy-terminal-range.json';
const runMinutes = Number(process.argv.find(s => s.startsWith('--run-minutes='))?.slice(14) ?? 20);
assert.ok(runMinutes > 0 && runMinutes <= 25);
const paths = ['scripts/analyze_terminal_range.ts', 'scripts/terminal_range_diagnostic.ts', 'scripts/terminal_range_diagnostic.test.ts', 'scripts/terminal_reply_fixture.ts', 'scripts/terminal_reply.ts', 'scripts/terminal_reply_batched.ts', ...['ai', 'certificateKnowledge', 'game', 'deck', 'gtoPolicy', 'endgame', 'forcedWin', 'jointForcedWin', 'sharedCardProof', 'evaluation', 'scoring', 'types'].map(s => `src/logic/${s}.ts`)];
const hashes = () => Object.fromEntries(paths.map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
const sourceHashes = hashes();
type Decision = { actor: number; startedUtc: string; elapsedMs: number; samples: number };
type Diagnostic = { state: GameState; prediction: ReturnType<typeof rangePrediction>; actual: ReturnType<typeof actualTerminalValues>; a9Card: string; predictedDifference: number; actualDifference: number; modelGap: number; actualVsA9: number; candidateCalibration: number; baselineCalibration: number };
type Match = { swap: number; dice: number[]; utility: number; decisions: Decision[]; diagnostic: Diagnostic };
type Pair = { deal: number; matches: Match[] };
function summarize(pairs: Pair[]) {
    function paired(key: 'predictedDifference' | 'actualDifference' | 'modelGap' | 'actualVsA9' | 'candidateCalibration' | 'baselineCalibration') {
        const values = pairs.map(p => p.matches.reduce((s, m) => s + m.diagnostic[key], 0) / 2);
        const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length - 1);
        const half = values.length > 1 && variance > 0 ? 1.96 * Math.sqrt(variance / values.length) : null;
        return { pairs: values.length, mean, normal95: half === null ? null : [mean - half, mean + half] };
    }
    const matches = pairs.flatMap(p => p.matches), decisions = matches.flatMap(m => m.decisions), rows = matches.map(m => m.diagnostic);
    return { pairs: pairs.length, games: matches.length, moves: decisions.length, controlWins: matches.filter(m => m.utility === 1).length, controlLosses: matches.filter(m => m.utility === -1).length, controlDraws: matches.filter(m => m.utility === 0).length,
        meanMs: decisions.reduce((s, d) => s + d.elapsedMs, 0) / Math.max(1, decisions.length), maxMs: Math.max(0, ...decisions.map(d => d.elapsedMs)), meanSamples: decisions.reduce((s, d) => s + d.samples, 0) / Math.max(1, decisions.length), over1020: decisions.filter(d => d.elapsedMs > 1020).length,
        changed: rows.filter(r => r.prediction.candidateIndex !== r.prediction.baselineIndex).length, actualBetter: rows.filter(r => r.actualDifference > 0).length, actualWorse: rows.filter(r => r.actualDifference < 0).length,
        predictedDifference: paired('predictedDifference'), actualDifference: paired('actualDifference'), modelGap: paired('modelGap'), actualVsA9: paired('actualVsA9'), candidateCalibration: paired('candidateCalibration'), baselineCalibration: paired('baselineCalibration') };
}
type Result = { seed: number; deals: number; sourceHashes: typeof sourceHashes; complete: boolean; pairs: Pair[]; summary?: ReturnType<typeof summarize>; protocol: object };
let result: Result = { seed, deals, sourceHashes, complete: false, pairs: [], protocol: {
    trajectory: 'Unmodified A9 vs A9, seat-swapped initial hands and turn selector, same remaining deck and dice; no candidate enters actual game', timeBudgetMs: 1000, requestedSamples: 64,
    choiceWorlds: 8, visibleChoiceWorlds: 1, independentEvaluationWorlds: 256,
    hypothesis: 'Uniform hidden-card model overstates local candidate-vs-deterministic-A7 win-utility improvement on reached A9 terminal states', primary: 'Actual improvement minus independent uniform forecast improvement, averaged by seat pair; confirm upper normal95 < 0 supports hypothesis',
    scope: 'Terminal counterfactual diagnostic only. A9 vs A9 is trajectory control. No candidate full-match strength/adoption claim; no tuning after selection.', productionAdoption: false,
} };
if (existsSync(output)) { result = JSON.parse(readFileSync(output, 'utf8')); assert.deepEqual(result.sourceHashes, sourceHashes); assert.equal(result.seed, seed); assert.equal(result.deals, deals); }
if (confirm) {
    const path = process.argv.find(s => s.startsWith('--selection='))?.slice(12); assert.ok(path);
    const selection: Result = JSON.parse(readFileSync(path, 'utf8')); assert.equal(selection.seed, 100510201); assert.ok(selection.complete); assert.deepEqual(selection.sourceHashes, sourceHashes);
}
function rng(value: number) { let n = value >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
function save() { assert.deepEqual(hashes(), sourceHashes); result.complete = result.pairs.length === deals; result.summary = summarize(result.pairs); writeFileSync(`${output}.tmp`, JSON.stringify(result, null, 2) + '\n'); renameSync(`${output}.tmp`, output); }
const temp = mkdtempSync(`${tmpdir()}/xy-terminal-range-`);
try {
    const source = readFileSync('src/logic/ai.ts', 'utf8') + '\nexport function resetResearchMatch() { delete forcedWinPlans[0]; delete forcedWinPlans[1]; }\n';
    const absolute = source.replace(/from '(\.\.?\/[^']+)'/g, (_all, path: string) => `from '${pathToFileURL(resolve('src/logic', `${path}.ts`)).href}'`);
    writeFileSync(`${temp}/runtime.mjs`, ts.transpileModule(absolute, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
    const runtime = await import(pathToFileURL(`${temp}/runtime.mjs`).href) as typeof import('../src/logic/ai') & { resetResearchMatch(): void };
    let smoke = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck: createDeck(), initialDice: [6, 3, 3, 2, 1], startingPlayer: 0 } });
    smoke = gameReducer(smoke, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
    assert.deepEqual(runtime.getBestMove(smoke, 0, { ...DEFAULT_AI_PARAMS, mcSimulations: 1 }), getBestMove(smoke, 0, { ...DEFAULT_AI_PARAMS, mcSimulations: 1 }));
    const deadline = performance.now() + runMinutes * 60000;
    function play(deck: Card[], dice: number[], deal: number, swap: number): Match {
        runtime.resetResearchMatch();
        const initialDeck = swap ? [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)] : deck;
        let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck, initialDice: dice, startingPlayer: swap } });
        state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: runtime.getBestTurnOrder(state, swap) ? swap : 1 - swap } });
        const decisions: Decision[] = []; let diagnostic: Diagnostic | undefined;
        while (state.phase === 'playing') {
            const actor = state.currentPlayerIndex as 0 | 1, startedUtc = new Date().toISOString(), start = performance.now();
            const move = runtime.getBestMove(state, actor, { ...DEFAULT_AI_PARAMS, mcSimulations: 64, timeBudgetMs: 1000 });
            decisions.push({ actor, startedUtc, elapsedMs: performance.now() - start, samples: runtime.getLastAiDecisionDiagnostics().completedBeliefSamples });
            if (terminalReplyView(state, actor)) {
                assert.equal(diagnostic, undefined);
                const prediction = rangePrediction(state, seed ^ Math.imul(deal + 1, 104729) ^ Math.imul(swap + 1, 8191));
                const actual = actualTerminalValues(state), b = prediction.baselineIndex, c = prediction.candidateIndex, a9 = actual.find(v => v.cardId === move.cardId); assert.ok(a9);
                const predictedDifference = prediction.predicted[c].utility - prediction.predicted[b].utility, actualDifference = actual[c].utility - actual[b].utility;
                diagnostic = { state, prediction, actual, a9Card: move.cardId, predictedDifference, actualDifference, modelGap: actualDifference - predictedDifference, actualVsA9: actual[c].utility - a9.utility, candidateCalibration: actual[c].utility - prediction.predicted[c].utility, baselineCalibration: actual[b].utility - prediction.predicted[b].utility };
            }
            const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move }); assert.notEqual(next, state); state = next;
        }
        if (state.phase === 'scoring') state = gameReducer(state, { type: 'CALCULATE_SCORE' }); assert.ok(state.winner); assert.ok(diagnostic); assert.equal(decisions.length, 30);
        return { swap, dice, utility: state.winner === 'draw' ? 0 : state.winner === `p${swap + 1}` ? 1 : -1, decisions, diagnostic };
    }
    for (let deal = result.pairs.length; deal < deals; deal++) {
        if (performance.now() + 70000 >= deadline) break;
        const random = rng(seed + Math.imul(deal + 1, 2654435761)), deck = createDeck();
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        const dice = Array.from({ length: 5 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => b - a);
        result.pairs.push({ deal, matches: [play(deck, dice, deal, 0), play(deck, dice, deal, 1)] }); save();
        console.error(`${result.pairs.length}/${deals} A9 seat pairs saved`);
    }
    save(); console.log(JSON.stringify({ complete: result.complete, summary: result.summary }, null, 2));
} finally { rmSync(temp, { recursive: true, force: true }); }
