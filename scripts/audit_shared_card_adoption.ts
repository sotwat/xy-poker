import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_AI_PARAMS, getBestMove, getLastAiDecisionDiagnostics } from '../src/logic/ai';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { getGtoHideProbability, scoreGtoMove } from '../src/logic/gtoPolicy';
import { proveSharedCardPlan, findSharedCardPlan } from './shared_card_proof';
import type { ForcedWinPlan } from '../src/logic/forcedWin';
import type { Card, GameState } from '../src/logic/types';

const input = process.argv.find(a => a.startsWith('--input='))?.slice(8);
const output = process.argv.find(a => a.startsWith('--output='))?.slice(9) ?? '/tmp/xy-shared-audit.json';
if (!input) throw new Error('--input required');
const data = JSON.parse(readFileSync(input, 'utf8')) as { seed: number; sourceHashes: Record<string, string>;
    examples: Array<{ state: GameState; search: { moves: ForcedWinPlan['moves']; proof: ReturnType<typeof proveSharedCardPlan> } }> };
const auditSourceHashes = Object.fromEntries([...new Set([...Object.keys(data.sourceHashes), 'src/logic/sharedCardProof.ts',
    'src/logic/ai.ts'])].map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
for (const p of ['src/logic/game.ts', 'src/logic/scoring.ts', 'src/logic/evaluation.ts']) {
    assert.equal(auditSourceHashes[p], data.sourceHashes[p], `Scoring source changed: ${p}`);
}

function audit(inputState: GameState, moves: ForcedWinPlan['moves'], lowerBound: number | null) {
    const state = structuredClone(inputState), actor = state.currentPlayerIndex as 0 | 1;
    const own = state.players[actor], other = state.players[1 - actor];
    const known = new Set([...own.hand, ...own.board.flat(), ...other.board.flat().filter(c => !c?.isHidden)]
        .filter((c): c is Card => c !== null).map(c => c.id));
    const unseen = createDeck().filter(c => !known.has(c.id));
    const slots: Array<[number, number]> = [];
    other.board.forEach((row, r) => row.forEach((card, c) => { if (!card || card.isHidden) slots.push([r, c]); }));
    assert.equal(slots.length, 4);
    for (const move of moves) own.board[move.row][move.colIndex] = own.hand.find(c => c.id === move.cardId)!;
    const used = new Set<string>();
    let worlds = 0, minimum = Infinity;
    const fill = (slot: number) => {
        if (slot < slots.length) {
            const [r, c] = slots[slot];
            for (const card of unseen) if (!used.has(card.id)) {
                used.add(card.id); other.board[r][c] = card; fill(slot + 1); used.delete(card.id);
            }
            return;
        }
        const scored = gameReducer({ ...state, phase: 'scoring' }, { type: 'CALCULATE_SCORE' });
        assert.equal(scored.winner, actor === 0 ? 'p1' : 'p2');
        const margin = scored.players[actor].score - scored.players[1 - actor].score;
        if (lowerBound !== null) assert.ok(margin >= lowerBound);
        minimum = Math.min(minimum, margin); worlds++;
    };
    fill(0);
    return { worlds, minimum };
}
const exact = [];
for (let i = 0; i < data.examples.length; i++) {
    const { state, search } = data.examples[i];
    const checked = proveSharedCardPlan(state, state.currentPlayerIndex as 0 | 1, search.moves);
    assert.equal(checked.status, 'proved');
    assert.equal(checked.lowerBound, search.proof.lowerBound);
    assert.equal(checked.coveredCompletions, search.proof.coveredCompletions);
    const oracle = audit(state, search.moves, search.proof.lowerBound);
    assert.equal(oracle.worlds, search.proof.coveredCompletions);
    assert.equal(oracle.worlds, search.proof.expectedCompletions);
    exact.push({ index: i, actor: state.currentPlayerIndex, ...oracle, lowerBound: search.proof.lowerBound });
    if (i === 0) writeFileSync('/tmp/xy-shared-confirm-first.json', JSON.stringify({ state, moves: search.moves, oracle }, null, 2));
    process.stderr.write(`oracle ${i + 1}/${data.examples.length}\n`);
}
function randomFor(value: number) {
    let rng = value >>> 0;
    return () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
}
const states: GameState[] = [];
for (let deal = 0; states.length < 32; deal++) {
    const random = randomFor(data.seed + Math.imul(deal, 2654435761)), deck = createDeck();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const dice = Array.from({ length: 5 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => b - a);
    for (const swap of [0, 1]) {
        const trajectoryRandom = randomFor(data.seed ^ Math.imul(deal + 1, 2246822519));
        const initialDeck = swap ? [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)] : deck;
        let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck, initialDice: dice, startingPlayer: swap } });
        state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: swap } });
        while (state.phase === 'playing') {
            const actor = state.currentPlayerIndex as 0 | 1, own = state.players[actor];
            const remaining = own.board.flat().filter(c => c === null).length;
            if (states.length < 32 && remaining >= 2 && remaining <= 3
                && state.players[1 - actor].board.flat().filter(c => !c || c.isHidden).length === 4) states.push(structuredClone(state));
            let best = -Infinity, move = { cardId: own.hand[0].id, colIndex: 0, isHidden: false };
            for (const card of own.hand) for (let col = 0; col < 5; col++) {
                if (own.board[2][col]) continue;
                const value = scoreGtoMove(state, actor, card, col) + (trajectoryRandom() - 0.5) * 3;
                if (value > best) { best = value; move = { cardId: card.id, colIndex: col, isHidden: false }; }
            }
            const card = own.hand.find(c => c.id === move.cardId)!;
            move.isHidden = trajectoryRandom() < getGtoHideProbability(state, actor, card, move.colIndex);
            const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
            assert.notEqual(next, state); state = next;
        }
    }
}
const runtime = [];
for (let i = 0; i < states.length; i++) {
    const state = states[i], actor = state.currentPlayerIndex as 0 | 1, started = performance.now();
    const baselineMove = getBestMove(state, actor, { ...DEFAULT_AI_PARAMS, timeBudgetMs: 1000, mcSimulations: 64 });
    const diagnostics = getLastAiDecisionDiagnostics(), baselineMs = performance.now() - started;
    const search = diagnostics.forcedWinPlanLength === 0
        ? findSharedCardPlan(state, actor, Math.min(started + 996, performance.now() + 50)) : null;
    const elapsedMs = performance.now() - started;
    assert.ok(elapsedMs <= 1020, `Decision deadline overrun: ${elapsedMs}`);
    const move = search?.moves?.[0] ?? baselineMove;
    assert.notEqual(gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move }), state);
    const oracle = search?.status === 'proved' ? audit(state, search.moves!, search.proof!.lowerBound) : null;
    runtime.push({ index: i, baselineMs, elapsedMs, completedSamples: diagnostics.completedBeliefSamples,
        baselineCertified: diagnostics.forcedWinPlanLength > 0, candidateStatus: search?.status ?? 'skipped', oracle });
    process.stderr.write(`runtime ${i + 1}/32\n`);
}
const result = { seed: data.seed, exact, runtime,
    allWorldsAudited: exact.reduce((s, e) => s + e.worlds, 0),
    nonRoyalAdditionalProofs: exact.filter(e => e.lowerBound !== null).length,
    runtimeAdditionalProofs: runtime.filter(r => r.candidateStatus === 'proved').length,
    maximumRuntimeMs: Math.max(...runtime.map(r => r.elapsedMs)),
    frozenStudySourceHashes: data.sourceHashes, auditSourceHashes,
    limits: ['Runtime uses a prefix of lightweight-generated states, not full A9 match trajectories.',
        'Every added runtime certificate is also exhaustively audited; win-rate improvement is unmeasured.'] };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, exact: undefined, runtime: undefined, sourceHashes: undefined }, null, 2));
