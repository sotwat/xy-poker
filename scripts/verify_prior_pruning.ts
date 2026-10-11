import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDeck } from '../src/logic/deck';
import { getBestTurnOrder } from '../src/logic/ai';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import type { Card } from '../src/logic/types';

type Decision = { actor: number; elapsedMs: number; samples: number; pruningCalls: number; changedPrunings: number; retainedChanges: number;
    move: { cardId: string; colIndex: number; isHidden: boolean } };
type Match = { variant: string; swap: number; dice: number[]; utility: number; scoreDifference: number; decisions: Decision[] };
type Result = { seed: number; deals: number; complete: boolean; sourceHashes: Record<string, string>; pairs: { deal: number; matches: Match[]; difference: number }[];
    summary: { meanUtilityDifference: number; normal95: number[] | null } };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-11);
for (const path of process.argv.slice(2)) {
    const result: Result = JSON.parse(readFileSync(path, 'utf8'));
    assert.ok(result.complete); assert.equal(result.pairs.length, result.deals);
    for (const [p, h] of Object.entries(result.sourceHashes)) assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'), h);
    let moves = 0, calls = 0, changed = 0, retainedChanges = 0, over1020 = 0;
    const differences: number[] = [];
    for (const pair of result.pairs) {
        let seed = (result.seed + Math.imul(pair.deal, 2654435761)) >>> 0;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const deck = createDeck();
        for (let i = 51; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        const dice = Array.from({ length: 5 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => b - a);
        const expectedOrder = (pair.deal % 2 ? ['control', 'candidate'] : ['candidate', 'control']).flatMap(v => [`${v}:0`, `${v}:1`]);
        assert.deepEqual(pair.matches.map(m => `${m.variant}:${m.swap}`), expectedOrder);
        for (const match of pair.matches) {
            assert.deepEqual(match.dice, dice); assert.equal(match.decisions.length, 30);
            const initialDeck = match.swap ? [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)] : deck;
            let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck, initialDice: dice, startingPlayer: match.swap } });
            state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: getBestTurnOrder(state, match.swap) ? match.swap : 1 - match.swap } });
            for (const d of match.decisions) {
                assert.equal(d.actor, state.currentPlayerIndex); assert.ok(d.samples >= 0 && d.samples <= 64);
                assert.ok(d.pruningCalls === 0 || d.pruningCalls === 1);
                if (match.variant !== 'candidate' || d.actor !== match.swap) assert.equal(d.pruningCalls, 0);
                assert.ok(d.changedPrunings <= d.pruningCalls); assert.equal(d.changedPrunings > 0, d.retainedChanges > 0);
                assert.ok(d.retainedChanges <= 16);
                const all = [...state.deck, ...state.players.flatMap(p => [...p.hand, ...p.board.flat().filter((c): c is Card => !!c)])];
                assert.equal(all.length, 52); assert.equal(new Set(all.map(c => c.id)).size, 52);
                const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: d.move }); assert.notEqual(next, state); state = next;
                moves++; calls += d.pruningCalls; changed += d.changedPrunings; retainedChanges += d.retainedChanges; over1020 += Number(d.elapsedMs > 1020);
            }
            assert.equal(state.phase, 'scoring'); state = gameReducer(state, { type: 'CALCULATE_SCORE' });
            assert.equal(match.utility, state.winner === 'draw' ? 0 : state.winner === `p${match.swap + 1}` ? 1 : -1);
            assert.equal(match.scoreDifference, state.players[match.swap].score - state.players[1 - match.swap].score);
        }
        const average = (variant: string) => pair.matches.filter(m => m.variant === variant).reduce((s, m) => s + m.utility, 0) / 2;
        const difference = average('candidate') - average('control'); assert.equal(difference, pair.difference); differences.push(difference);
    }
    const mean = differences.reduce((a, b) => a + b, 0) / differences.length;
    const variance = differences.reduce((s, d) => s + (d - mean) ** 2, 0) / (differences.length - 1);
    const half = 1.96 * Math.sqrt(variance / differences.length);
    close(mean, result.summary.meanUtilityDifference);
    if (variance > 0) { close(mean - half, result.summary.normal95![0]); close(mean + half, result.summary.normal95![1]); }
    else assert.equal(result.summary.normal95, null);
    console.log(JSON.stringify({ path, pairs: differences.length, moves, calls, changed, retainedChanges, over1020, mean, pairDifferences: differences }));
}
