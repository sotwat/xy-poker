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
import { scoreHiddenSet } from './hidden_set_calibration';
import type { Card } from '../src/logic/types';

const confirm = process.argv.includes('--confirm'), seed = confirm ? 100511502 : 100511501, deals = confirm ? 16 : 8;
const output = process.argv.find(s => s.startsWith('--output='))?.slice(9) ?? '/tmp/xy-hidden-set.json';
const runMinutes = Number(process.argv.find(s => s.startsWith('--run-minutes='))?.slice(14) ?? 20);
assert.ok(runMinutes > 0 && runMinutes <= 25);
const deadlineUtc = Date.now() + runMinutes * 60000;
const paths = ['scripts/analyze_hidden_set.ts', 'scripts/hidden_set_calibration.ts', 'scripts/hidden_set_calibration.test.ts', 'scripts/terminal_reply_fixture.ts', ...['ai', 'certificateKnowledge', 'game', 'deck', 'gtoPolicy', 'endgame', 'forcedWin', 'jointForcedWin', 'sharedCardProof', 'evaluation', 'scoring', 'types'].map(s => `src/logic/${s}.ts`)];
const hashes = () => Object.fromEntries(paths.map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
const sourceHashes = hashes();
type Decision = { actor: number; startedUtc: string; elapsedMs: number; samples: number; move: ReturnType<typeof getBestMove> };
type Diagnostic = { turn: number; forecast: NonNullable<ReturnType<typeof scoreHiddenSet>> };
type Match = { swap: number; dice: number[]; utility: number; decisions: Decision[]; diagnostics: Diagnostic[]; meanDifference: number | null };
type Pair = { deal: number; matches: Match[] };
function summarize(pairs: Pair[]) {
    const values = pairs.filter(p => p.matches.every(m => m.meanDifference !== null)).map(p => p.matches.reduce((sum, m) => sum + m.meanDifference!, 0) / 2);
    const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length - 1);
    const half = values.length > 1 && variance > 0 ? 1.96 * Math.sqrt(variance / values.length) : null;
    const matches = pairs.flatMap(p => p.matches), decisions = matches.flatMap(m => m.decisions), rows = matches.flatMap(m => m.diagnostics.map(d => d.forecast));
    return { pairs: pairs.length, completeDiagnosticPairs: values.length, pairDifferences: values, games: matches.length, moves: decisions.length,
        controlWins: matches.filter(m => m.utility === 1).length, controlLosses: matches.filter(m => m.utility === -1).length, controlDraws: matches.filter(m => m.utility === 0).length,
        meanMs: decisions.reduce((s, d) => s + d.elapsedMs, 0) / Math.max(1, decisions.length), maxMs: Math.max(0, ...decisions.map(d => d.elapsedMs)), meanSamples: decisions.reduce((s, d) => s + d.samples, 0) / Math.max(1, decisions.length), over1020: decisions.filter(d => d.elapsedMs > 1020).length,
        states: rows.length, actualLow: rows.reduce((s, r) => s + r.actualLow, 0), hiddenLabels: rows.reduce((s, r) => s + r.forecast.hiddenCount, 0),
        brierPooled: rows.reduce((s, r) => s + r.brier, 0) / Math.max(1, rows.length),

        meanDifference: mean, normal95: half === null ? null : [mean - half, mean + half] };

}
type Result = { seed: number; deals: number; sourceHashes: typeof sourceHashes; complete: boolean; pairs: Pair[]; summary?: ReturnType<typeof summarize>; protocol: object };
let result: Result = { seed, deals, sourceHashes, complete: false, pairs: [], protocol: {
    trajectory: 'Unmodified A9 vs A9, seat-swapped initial hands and turn selector, same remaining deck and dice; no candidate enters actual game', timeBudgetMs: 1000, requestedSamples: 64,
    hypothesis: 'Actual concealed sets contain a larger fraction of rank<=7 cards than the uniform unseen-pool forecast; threshold fixed from existing concealment policy, not fitted',
    primary: 'Actual concealed low-card fraction minus known-card-adjusted unseen low fraction; average within game, seats, then deals. Selection mean >0; confirmation lower normal95 >0 and all pairs represented supports positive calibration bias.',
    eligibility: 'Comparison actor only before every move, opponent at least one concealed board card; missing games make pair incomplete, no replacement.',
    scope: 'Exact hypergeometric uniform forecast from own known cards and public opponent board only; real hidden identities used only as labels. Diagnostic of a specified marginal, not full-set calibration, opponent posterior, win rate or adoption.', productionAdoption: false,
} };
if (existsSync(output)) { result = JSON.parse(readFileSync(output, 'utf8')); assert.deepEqual(result.sourceHashes, sourceHashes); assert.equal(result.seed, seed); assert.equal(result.deals, deals); }
if (confirm) {
    const path = process.argv.find(s => s.startsWith('--selection='))?.slice(12); assert.ok(path);
    const selection: Result = JSON.parse(readFileSync(path, 'utf8')); assert.equal(selection.seed, 100511501); assert.ok(selection.complete); assert.deepEqual(selection.sourceHashes, sourceHashes); assert.ok(selection.summary!.meanDifference > 0 && selection.summary!.completeDiagnosticPairs === selection.deals);
}
function rng(value: number) { let n = value >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
function save() { assert.deepEqual(hashes(), sourceHashes); result.complete = result.pairs.length === deals; result.summary = summarize(result.pairs); writeFileSync(`${output}.tmp`, JSON.stringify(result, null, 2) + '\n'); renameSync(`${output}.tmp`, output); }
const temp = mkdtempSync(`${tmpdir()}/xy-hidden-set-`);
try {
    const source = readFileSync('src/logic/ai.ts', 'utf8') + '\nexport function resetResearchMatch() { delete forcedWinPlans[0]; delete forcedWinPlans[1]; }\n';
    const absolute = source.replace(/from '(\.\.?\/[^']+)'/g, (_all, path: string) => `from '${pathToFileURL(resolve('src/logic', `${path}.ts`)).href}'`);
    writeFileSync(`${temp}/runtime.mjs`, ts.transpileModule(absolute, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
    const runtime = await import(pathToFileURL(`${temp}/runtime.mjs`).href) as typeof import('../src/logic/ai') & { resetResearchMatch(): void };
    let smoke = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck: createDeck(), initialDice: [6, 3, 3, 2, 1], startingPlayer: 0 } });
    smoke = gameReducer(smoke, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
    assert.deepEqual(runtime.getBestMove(smoke, 0, { ...DEFAULT_AI_PARAMS, mcSimulations: 1 }), getBestMove(smoke, 0, { ...DEFAULT_AI_PARAMS, mcSimulations: 1 }));
    const deadline = performance.now() + runMinutes * 60000;
    function play(deck: Card[], dice: number[], swap: number): Match {
        runtime.resetResearchMatch();
        const initialDeck = swap ? [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)] : deck;
        let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck, initialDice: dice, startingPlayer: swap } });
        state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: runtime.getBestTurnOrder(state, swap) ? swap : 1 - swap } });
        const decisions: Decision[] = [], diagnostics: Diagnostic[] = [];
        while (state.phase === 'playing') {
            const actor = state.currentPlayerIndex as 0 | 1, startedUtc = new Date().toISOString(), start = performance.now();
            const move = runtime.getBestMove(state, actor, { ...DEFAULT_AI_PARAMS, mcSimulations: 64, timeBudgetMs: 1000 });
            decisions.push({ actor, startedUtc, elapsedMs: performance.now() - start, samples: runtime.getLastAiDecisionDiagnostics().completedBeliefSamples, move });
            if (actor === swap) {
                const forecast = scoreHiddenSet(state, actor);
                if (forecast) diagnostics.push({ turn: decisions.length, forecast });
            }
            const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move }); assert.notEqual(next, state); state = next;
        }
        if (state.phase === 'scoring') state = gameReducer(state, { type: 'CALCULATE_SCORE' }); assert.ok(state.winner); assert.equal(decisions.length, 30);
        return { swap, dice, utility: state.winner === 'draw' ? 0 : state.winner === `p${swap + 1}` ? 1 : -1, decisions, diagnostics, meanDifference: diagnostics.length ? diagnostics.reduce((s, d) => s + d.forecast.difference, 0) / diagnostics.length : null };
    }
    for (let deal = result.pairs.length; deal < deals; deal++) {
        if (performance.now() + 70000 >= deadline || Date.now() + 70000 >= deadlineUtc) break;
        const random = rng(seed + Math.imul(deal + 1, 2654435761)), deck = createDeck();
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        const dice = Array.from({ length: 5 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => b - a);
        result.pairs.push({ deal, matches: [play(deck, dice, 0), play(deck, dice, 1)] }); save();
        console.error(`${result.pairs.length}/${deals} A9 seat pairs saved`);
    }
    save(); console.log(JSON.stringify({ complete: result.complete, summary: result.summary }, null, 2));
} finally { rmSync(temp, { recursive: true, force: true }); }
