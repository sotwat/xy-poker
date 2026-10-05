import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { findIndependentForcedWinPlan } from '../src/logic/forcedWin';
import { findJointForcedWinPlan } from '../src/logic/jointForcedWin';
import { gameReducer, INITIAL_GAME_STATE, isValidGameState } from '../src/logic/game';
import { getGtoHideProbability, scoreGtoMove } from '../src/logic/gtoPolicy';
import { findSharedCardPlan } from './shared_card_proof';
import type { GameState } from '../src/logic/types';

function integer(name: string, fallback: number) {
    const n = Number(process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
    if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid ${name}`);
    return n;
}
const seed = integer('seed', 100505301), deals = integer('deals', 200), budgetMs = integer('budget-ms', 50);
const output = process.argv.find(a => a.startsWith('--output='))?.slice(9) ?? '/tmp/xy-shared-adoption.json';
const sourceHashes = Object.fromEntries(['scripts/shared_card_proof.ts', 'scripts/analyze_shared_card_adoption.ts',
    'src/logic/sharedCardProof.ts',
    'src/logic/forcedWin.ts', 'src/logic/jointForcedWin.ts', 'src/logic/game.ts', 'src/logic/scoring.ts',
    'src/logic/evaluation.ts', 'src/logic/gtoPolicy.ts'].map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
function randomFor(value: number) {
    let rng = value >>> 0;
    return () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
}
const rows: Array<{ deal: number; seatSwap: number; actor: number; remaining: number; unknown: number;
    baseline: boolean; baselineMs: number; totalMs: number; addedMs: number; status: string;
    candidates: number; counterexampleRejections: number }> = [];
const examples: Array<{ deal: number; seatSwap: number; state: GameState; search: ReturnType<typeof findSharedCardPlan> }> = [];
const started = performance.now();
for (let deal = 0; deal < deals; deal++) {
    const setupRandom = randomFor(seed + Math.imul(deal, 2654435761));
    const deck = createDeck();
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(setupRandom() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const dice = Array.from({ length: 5 }, () => 1 + Math.floor(setupRandom() * 6)).sort((a, b) => b - a);
    for (const seatSwap of [0, 1]) {
        const random = randomFor(seed ^ Math.imul(deal + 1, 2246822519));
        const initialDeck = seatSwap ? [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)] : deck;
        let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck, initialDice: dice, startingPlayer: seatSwap } });
        state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: seatSwap } });
        while (state.phase === 'playing') {
            const actor = state.currentPlayerIndex as 0 | 1, own = state.players[actor], opponent = state.players[1 - actor];
            const remaining = own.board.flat().filter(c => c === null).length;
            const unknown = opponent.board.flat().filter(c => !c || c.isHidden).length;
            if (remaining >= 2 && remaining <= 3) {
                if (!isValidGameState(state)) throw new Error('Invalid generated state');
                const start = performance.now(), deadline = start + budgetMs;
                const baseline = findIndependentForcedWinPlan(state, actor, deadline)
                    ?? (performance.now() < deadline ? findJointForcedWinPlan(state, actor, deadline) : null);
                const baselineMs = performance.now() - start;
                const before = performance.now();
                const search = !baseline && unknown === 4 ? findSharedCardPlan(state, actor, deadline) : null;
                const addedMs = performance.now() - before;
                rows.push({ deal, seatSwap, actor, remaining, unknown, baseline: Boolean(baseline), baselineMs,
                    totalMs: performance.now() - start, addedMs, status: search?.status ?? 'skipped',
                    candidates: search?.candidates ?? 0, counterexampleRejections: search?.counterexampleRejections ?? 0 });
                if (search?.status === 'proved') examples.push({ deal, seatSwap, state: structuredClone(state), search });
            }
            let best = -Infinity, move = { cardId: own.hand[0].id, colIndex: 0, isHidden: false };
            for (const card of own.hand) for (let col = 0; col < 5; col++) {
                if (own.board[2][col]) continue;
                const value = scoreGtoMove(state, actor, card, col) + (random() - 0.5) * 3;
                if (value > best) { best = value; move = { cardId: card.id, colIndex: col, isHidden: false }; }
            }
            const card = own.hand.find(c => c.id === move.cardId)!;
            move.isHidden = random() < getGtoHideProbability(state, actor, card, move.colIndex);
            const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
            if (next === state) throw new Error('Illegal trajectory move');
            state = next;
        }
    }
    if ((deal + 1) % 25 === 0) process.stderr.write(`${deal + 1}/${deals}: ${examples.length} additional proofs\n`);
}
const eligible = rows.filter(r => !r.baseline && r.unknown === 4);
const summary = { decisions: rows.length, baselineProofs: rows.filter(r => r.baseline).length,
    eligible: eligible.length, addedProofs: examples.length, timeouts: eligible.filter(r => r.status === 'timeout').length,
    meanAddedMs: eligible.reduce((s, r) => s + r.addedMs, 0) / Math.max(1, eligible.length),
    maximumTotalMs: Math.max(...rows.map(r => r.totalMs)),
    elapsedSeconds: (performance.now() - started) / 1000 };
writeFileSync(output, JSON.stringify({ seed, pairedDeals: deals, budgetMs, productionCandidateUnknownCount: 4,
    trajectory: 'Lightweight A7 with public-only move noise and concealment; swapped seats and initial hands',
    sourceHashes, summary, rows, examples,
    limits: ['Certificate holdout, not a full A9 versus A9 win-rate comparison.',
        'The baseline certificate runs first and the candidate uses only its remaining deadline.',
        'States within one paired deal are dependent; no per-state significance claim.'] }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
