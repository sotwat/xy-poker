import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { getBestTurnOrder } from '../src/logic/ai';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { predictHiddenRankRelation, scoreHiddenRankRelation } from './hidden_rank_relation';
import type { Card } from '../src/logic/types';

type Diagnostic = { turn: number; forecast: NonNullable<ReturnType<typeof scoreHiddenRankRelation>> };
type Result = { seed: number; deals: number; complete: boolean; sourceHashes: Record<string, string>; pairs: {
    deal: number; matches: { swap: number; dice: number[]; utility: number; meanDifference: number; diagnostics: Diagnostic[];
        decisions: { actor: number; samples: number; elapsedMs: number; move: { cardId: string; colIndex: number; isHidden: boolean } }[] }[];
}[]; summary: { pairDifferences: number[]; meanDifference: number; normal95: number[] } };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-11, `${a} != ${b}`);
let checkedMoves = 0, checkedStates = 0;
for (const path of process.argv.slice(2)) {
    const result: Result = JSON.parse(readFileSync(path, 'utf8'));
    assert.ok(result.complete); assert.equal(result.pairs.length, result.deals);
    for (const [file, hash] of Object.entries(result.sourceHashes)) assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), hash);
    const pairs: number[] = [];
    for (const pair of result.pairs) {
        let seed = (result.seed + Math.imul(pair.deal + 1, 2654435761)) >>> 0;
        function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
        const deck = createDeck();
        for (let i = 51; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        const dice = Array.from({ length: 5 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => b - a);
        const seats: number[] = []; assert.deepEqual(pair.matches.map(m => m.swap), [0, 1]);
        for (const match of pair.matches) {
            assert.deepEqual(match.dice, dice); assert.equal(match.decisions.length, 30);
            const initialDeck = match.swap ? [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)] : deck;
            let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck, initialDice: dice, startingPlayer: match.swap } });
            state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: getBestTurnOrder(state, match.swap) ? match.swap : 1 - match.swap } });
            const residuals: number[] = []; let diagnosticCount = 0;
            for (const [i, decision] of match.decisions.entries()) {
                const actor = state.currentPlayerIndex as 0 | 1;
                assert.equal(decision.actor, actor); assert.ok(decision.samples >= 0 && decision.samples <= 64);
                const all = [...state.deck, ...state.players.flatMap(p => [...p.hand, ...p.board.flat().filter((c): c is Card => !!c)])];
                assert.equal(new Set(all.map(c => c.id)).size, 52); assert.equal(all.length, 52);
                const scored = actor === match.swap ? scoreHiddenRankRelation(state, actor) : null;
                const saved = match.diagnostics.find(d => d.turn === i + 1);
                assert.equal(!!scored, !!saved);
                if (scored) {
                    assert.deepEqual(scored, saved!.forecast); diagnosticCount++;
                    const changed = structuredClone(state);
                    for (const c of [...changed.players[1 - actor].hand, ...changed.players[1 - actor].board.flat().filter(c => c?.isHidden)]) {
                        if (c) { c.id = 'private'; c.rank = 14; c.suit = 'hearts'; }
                    }
                    changed.deck.reverse(); assert.deepEqual(predictHiddenRankRelation(changed, actor), scored.forecast);
                    const own = state.players[actor], opp = state.players[1 - actor];
                    const known = new Set([...own.hand, ...own.board.flat().filter((c): c is Card => !!c), ...opp.board.flat().filter((c): c is Card => !!c && !c.isHidden)].map(c => c.id));
                    const pool = createDeck().filter(c => !known.has(c.id));
                    let actual = 0, expected = 0, squares = 0, count = 0;
                    for (let col = 0; col < 5; col++) {
                        const publicRanks = new Set(opp.board.map(r => r[col]).filter((c): c is Card => !!c && !c.isHidden).map(c => c.rank));
                        if (!publicRanks.size) continue;
                        for (const row of opp.board) if (row[col]?.isHidden) {
                            const label = Number(publicRanks.has(row[col]!.rank));
                            const probability = pool.reduce((n, c) => n + Number(publicRanks.has(c.rank)), 0) / pool.length;
                            actual += label; expected += probability; squares += (label - probability) ** 2; count++;
                        }
                    }
                    close(scored.actualFraction, actual / count); close(scored.forecast.predictedFraction, expected / count); close(scored.brier, squares / count);
                    residuals.push((actual - expected) / count); checkedStates++;
                }
                const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: decision.move }); assert.notEqual(next, state); state = next; checkedMoves++;
            }
            assert.equal(diagnosticCount, match.diagnostics.length); assert.ok(residuals.length);
            assert.equal(state.phase, 'scoring'); state = gameReducer(state, { type: 'CALCULATE_SCORE' });
            assert.equal(match.utility, state.winner === 'draw' ? 0 : state.winner === `p${match.swap + 1}` ? 1 : -1);
            const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length; close(mean, match.meanDifference); seats.push(mean);
        }
        pairs.push((seats[0] + seats[1]) / 2);
    }
    pairs.forEach((p, i) => close(p, result.summary.pairDifferences[i]));
    const mean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
    const half = 1.96 * Math.sqrt(pairs.reduce((s, p) => s + (p - mean) ** 2, 0) / (pairs.length * (pairs.length - 1)));
    close(mean, result.summary.meanDifference); close(mean - half, result.summary.normal95[0]); close(mean + half, result.summary.normal95[1]);
    console.log(`${path}: ${pairs.length} pairs verified`);
}
console.log(JSON.stringify({ checkedMoves, checkedStates }));
