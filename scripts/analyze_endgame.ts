import { writeFileSync } from 'node:fs';
import { DEFAULT_AI_PARAMS, getBestMove, getLastAiDecisionDiagnostics } from '../src/logic/ai';
import { certifiedEndgameReplacement, solveFinalMove } from '../src/logic/endgame';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { getGtoHideProbability, getGtoTurnOrderScore, scoreGtoMove } from '../src/logic/gtoPolicy';
import type { GameState } from '../src/logic/types';

const flag = (name: string, fallback: number) => {
    const value = Number(process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
    return value;
};
const games = flag('games', 1000), seed = flag('seed', 10826541);
const search = process.argv.includes('--search');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const params = { ...DEFAULT_AI_PARAMS, policyGeneration: 'a7' as const, timeBudgetMs: 1000, mcSimulations: 64 };
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
function resultAfter(state: GameState, move: ReturnType<typeof getBestMove>) {
    const actor = state.currentPlayerIndex;
    let result = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
    while (result.phase === 'playing') result = gameReducer(result, {
        type: 'PLACE_AND_DRAW', payload: getBestMove(result, result.currentPlayerIndex, params),
    });
    result = gameReducer(result, { type: 'CALCULATE_SCORE' });
    if (result.phase !== 'ended') throw new Error('Endgame did not reach scoring');
    return result.winner === (actor === 0 ? 'p1' : 'p2') ? 1 : result.winner === 'draw' ? 0 : -1;
}
const results: Array<{ game: number; response: boolean; worlds: number; changed: boolean; delta: number; ms: number; samples: number }> = [];
const examples: Array<{ state: GameState; baseline: ReturnType<typeof getBestMove>; candidate: ReturnType<typeof getBestMove>; delta: number }> = [];
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
        const terminal = state.players[actor].board.flat().filter(card => card === null).length === 1;
        const move = search || terminal ? getBestMove(state, actor, params) : policyMove(state);
        if (terminal) {
            const samples = getLastAiDecisionDiagnostics().completedBeliefSamples;
            const before = performance.now();
            const analysis = solveFinalMove(state, actor, before + 900);
            const ms = performance.now() - before;
            const certified = analysis ? certifiedEndgameReplacement(analysis, move.cardId) : undefined;
            const candidate = certified ? { cardId: certified.cardId, colIndex: certified.colIndex, isHidden: move.isHidden } : move;
            const delta = certified ? resultAfter(state, candidate) - resultAfter(state, move) : 0;
            if (delta < 0) throw new Error('Certificate allowed a worse actual outcome');
            results.push({ game, response: state.players[1 - actor].board.flat().some(card => card === null),
                worlds: analysis?.worlds ?? 0, changed: Boolean(certified), delta, ms, samples });
            if (certified && examples.length < 6 && (delta > 0 || analysis?.opponentCanRespond)) {
                examples.push({ state, baseline: move, candidate, delta });
            }
        }
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        if (next === state) throw new Error('Illegal move in trajectory');
        state = next;
    }
    if ((game + 1) % (search ? 1 : 100) === 0) process.stderr.write(`${game + 1}/${games} games\n`);
}
function summarize(rows: typeof results) {
    const mean = rows.reduce((sum, row) => sum + row.delta, 0) / rows.length;
    const se = Math.sqrt(rows.reduce((sum, row) => sum + (row.delta - mean) ** 2, 0) / (rows.length - 1) / rows.length);
    return { decisions: rows.length, completed: rows.filter(row => row.worlds > 0).length,
        changed: rows.filter(row => row.changed).length, benefits: rows.filter(row => row.delta > 0).length,
        harms: rows.filter(row => row.delta < 0).length, meanUtilityImprovement: mean,
        lower95: mean - 1.96 * se, upper95: mean + 1.96 * se,
        averageMs: rows.reduce((sum, row) => sum + row.ms, 0) / rows.length, maximumMs: Math.max(...rows.map(row => row.ms)),
    };
}
const report = { seed, games, search, params,
    finalMove: summarize(results.filter(row => !row.response)),
    penultimateMove: summarize(results.filter(row => row.response)),
    runtimeSeconds: (performance.now() - started) / 1000, results, examples };
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, results: undefined, examples: undefined }, null, 2));
