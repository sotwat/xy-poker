import { writeFileSync } from 'node:fs';
import { DEFAULT_AI_PARAMS, getBestMove, getLastAiDecisionDiagnostics } from '../src/logic/ai';
import { continueForcedWinPlan, findForcedWinPlan, type ForcedWinPlan } from '../src/logic/forcedWin';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { getGtoHideProbability, getGtoTurnOrderScore, scoreGtoMove } from '../src/logic/gtoPolicy';
import type { GameState } from '../src/logic/types';

function positiveFlag(name: string, fallback: number) {
    const value = Number(process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
    return value;
}
const games = positiveFlag('games', 200), seed = positiveFlag('seed', 100209001);
const search = process.argv.includes('--search');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const params = { ...DEFAULT_AI_PARAMS, policyGeneration: 'a8' as const, timeBudgetMs: 1000, mcSimulations: 64 };
let rng = seed >>> 0;
function random() {
    rng = (rng + 0x6d2b79f5) >>> 0;
    let value = Math.imul(rng ^ (rng >>> 15), rng | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
function policyMove(state: GameState) {
    const actor = state.currentPlayerIndex as 0 | 1, player = state.players[actor];
    let best = -Infinity;
    let selected = { cardId: player.hand[0].id, colIndex: 0, isHidden: false };
    for (const card of player.hand) for (let column = 0; column < 5; column++) {
        if (player.board[2][column]) continue;
        const score = scoreGtoMove(state, actor, card, column);
        if (score > best) { best = score; selected = { cardId: card.id, colIndex: column, isHidden: false }; }
    }
    const card = player.hand.find(card => card.id === selected.cardId)!;
    selected.isHidden = random() < getGtoHideProbability(state, actor, card, selected.colIndex);
    return selected;
}
function finish(state: GameState, plan: ForcedWinPlan | null) {
    const actor = state.currentPlayerIndex;
    while (state.phase === 'playing') {
        const move = plan && state.currentPlayerIndex === actor ? continueForcedWinPlan(state, plan)
            : getBestMove(state, state.currentPlayerIndex, params);
        if (!move) throw new Error('Certified continuation was lost');
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        if (next === state) throw new Error('Illegal continuation');
        state = next;
    }
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    if (state.phase !== 'ended') throw new Error('Unfinished game');
    return state.winner === (actor === 0 ? 'p1' : 'p2') ? 1 : state.winner === 'draw' ? 0 : -1;
}
const rows: Array<{ game: number; remaining: number; certified: boolean; delta: number; ms: number; baselineMs: number; hands: number }> = [];
const examples: Array<{ state: GameState; plan: ForcedWinPlan; baseline: ReturnType<typeof getBestMove>; delta: number }> = [];
const started = performance.now();
for (let game = 0; game < games; game++) {
    const deck = createDeck();
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: {
        initialDeck: deck, startingPlayer: game % 2,
        initialDice: Array.from({ length: 5 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => b - a),
    } });
    const chooser = state.currentPlayerIndex;
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: {
        startingPlayer: getGtoTurnOrderScore(state.players[chooser]) > 0 ? chooser : 1 - chooser,
    } });
    while (state.phase === 'playing') {
        const actor = state.currentPlayerIndex as 0 | 1;
        const remaining = state.players[actor].board.flat().filter(card => card === null).length;
        const move = search || remaining <= 3 ? getBestMove(state, actor, params) : policyMove(state);
        if (remaining === 2 || remaining === 3) {
            const baselineMs = getLastAiDecisionDiagnostics().elapsedMs;
            const before = performance.now();
            const plan = findForcedWinPlan(state, actor, before + Math.max(0, 996 - baselineMs));
            const ms = performance.now() - before;
            const candidate = plan ? finish(state, plan) : null;
            if (plan && candidate !== 1) throw new Error('Certified plan did not win');
            const delta = plan ? candidate! - finish(state, null) : 0;
            rows.push({ game, remaining, certified: Boolean(plan), delta, ms, baselineMs, hands: plan?.evaluatedHands ?? 0 });
            if (plan && delta > 0 && examples.filter(example => example.plan.moves.length === remaining).length < 2) {
                examples.push({ state, plan, baseline: move, delta });
            }
        }
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        if (next === state) throw new Error('Illegal trajectory move');
        state = next;
    }
    if ((game + 1) % (search ? 1 : 25) === 0) process.stderr.write(`${game + 1}/${games}: ${rows.filter(row => row.delta > 0).length} improvements\n`);
}
function summarize(selected: typeof rows) {
    const times = selected.map(row => row.ms).sort((a, b) => a - b);
    const clusters = Array.from({ length: games }, (_, game) => {
        const observations = selected.filter(row => row.game === game);
        return observations.reduce((sum, row) => sum + row.delta, 0) / observations.length;
    });
    const mean = clusters.reduce((sum, value) => sum + value, 0) / clusters.length;
    const se = clusters.length > 1 ? Math.sqrt(clusters.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clusters.length - 1) / clusters.length) : null;
    return { decisions: selected.length, certified: selected.filter(row => row.certified).length,
        benefits: selected.filter(row => row.delta > 0).length, harms: selected.filter(row => row.delta < 0).length,
        meanUtilityGainPerDecision: mean, lower95: se ? mean - 1.96 * se : null, upper95: se ? mean + 1.96 * se : null,
        meanMs: times.reduce((sum, value) => sum + value, 0) / times.length,
        p95Ms: times[Math.floor(times.length * 0.95)], maxMs: times.at(-1) };
}
const report = { seed, games, trajectory: search ? 'full A8 search' : 'lightweight A7, full A8 for the last three moves per player', params,
    twoMoves: summarize(rows.filter(row => row.remaining === 2)), threeMoves: summarize(rows.filter(row => row.remaining === 3)),
    elapsedSeconds: (performance.now() - started) / 1000, rows, examples };
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, rows: undefined, examples: undefined }, null, 2));
