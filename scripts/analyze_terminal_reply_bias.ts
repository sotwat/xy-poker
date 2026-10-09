import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { getGtoHideProbability, scoreGtoMove, XY_GTO_A7 } from '../src/logic/gtoPolicy';
import { chooseTerminalReply, setTerminalReplyEnabled, terminalPayoff, terminalReplyView } from './terminal_reply';
import type { Card, GameState } from '../src/logic/types';

const confirm = process.argv.includes('--confirm'), seed = confirm ? 100509502 : 100509501, deals = confirm ? 400 : 200;
const output = process.argv.find(s => s.startsWith('--output='))?.slice(9) ?? '/tmp/xy-terminal-bias.json';
const paths = ['scripts/analyze_terminal_reply_bias.ts', 'scripts/terminal_reply.ts', ...['game', 'gtoPolicy', 'deck', 'evaluation', 'scoring', 'types'].map(s => `src/logic/${s}.ts`)];
const hashes = () => Object.fromEntries(paths.map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
const sourceHashes = hashes();
if (confirm) {
    const path = process.argv.find(s => s.startsWith('--selection='))?.slice(12); assert.ok(path);
    const selection = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(selection.seed, 100509501); assert.equal(selection.complete, true); assert.deepEqual(selection.sourceHashes, sourceHashes);
}
function rng(value: number) { let n = value >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
function shuffle(cards: Card[], random: () => number) {
    const result = [...cards];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
}
const shaped = (v: { utility: number; margin: number }) => v.utility + Math.max(-0.45, Math.min(0.45, v.margin / 40));
type Row = { deal: number; swap: number; hand: number; hidden: number; changed: boolean; optimism: number; heldoutDifference: number; heldoutWinDifference: number; trainingSamples: number; evaluationSamples: number };
const rows: Row[] = [];
let generatedMoves = 0, worldsChecked = 0, reducerChecks = 0;
function inspect(state: GameState, deal: number, swap: number) {
    const actor = state.currentPlayerIndex as 0 | 1, maybeView = terminalReplyView(state, actor); assert.ok(maybeView);
    const view = maybeView;
    const column = view.ownBoard[2].findIndex(c => !c);
    const baselineIndex = view.hand.map(c => scoreGtoMove(state, actor, c, column, XY_GTO_A7)).reduce((best, value, i, all) => value > all[best] ? i : best, 0);
    const baseline = { cardId: view.hand[baselineIndex].id, colIndex: column, isHidden: false };
    setTerminalReplyEnabled(true); const candidate = chooseTerminalReply(state, actor, baseline);
    const candidateIndex = view.hand.findIndex(c => c.id === candidate.cardId); assert.ok(candidateIndex >= 0);
    const key = JSON.stringify(view); let trainingSeed = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) trainingSeed = Math.imul(trainingSeed ^ key.charCodeAt(i), 0x01000193) >>> 0;
    const knownCards = [...view.hand, ...view.ownBoard.flat(), ...view.opponentBoard.flat()].filter((c): c is Card => c !== null);
    const known = new Set(knownCards.map(c => c.id)); assert.equal(known.size, knownCards.length);
    const unseen = createDeck().filter(c => !known.has(c.id));
    const hidden: Array<[number, number]> = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) if (!view.opponentBoard[r][c]) hidden.push([r, c]);
    function evaluate(count: number, random: () => number, check: boolean) {
        const values = view.hand.map(() => ({ utility: 0, shaped: 0 }));
        for (let sample = 0; sample < count; sample++) {
            const board = view.opponentBoard.map(r => [...r]) as Card[][], pool = [...unseen];
            for (const [r, c] of hidden) { const i = Math.floor(random() * pool.length); board[r][c] = pool[i]; pool.splice(i, 1); }
            const ids = [...view.hand, ...view.ownBoard.flat().filter((c): c is Card => c !== null), ...board.flat()].map(c => c.id);
            assert.equal(new Set(ids).size, ids.length); worldsChecked++;
            for (let i = 0; i < view.hand.length; i++) {
                const ownBoard = view.ownBoard.map(r => [...r]) as Card[][]; ownBoard[2][column] = view.hand[i];
                const payoff = terminalPayoff(ownBoard, board, view.dice, actor);
                values[i].utility += payoff.utility / count; values[i].shaped += shaped(payoff) / count;
                if (check && sample === 0 && i === candidateIndex) {
                    const world = structuredClone(state), opponent = world.players[1 - actor];
                    opponent.board = board;
                    const handSize = opponent.hand.length;
                    opponent.hand = pool.slice(0, handSize); world.deck = pool.slice(handSize);
                    const placed = gameReducer(world, { type: 'PLACE_AND_DRAW', payload: candidate }); assert.equal(placed.phase, 'scoring');
                    const end = gameReducer(placed, { type: 'CALCULATE_SCORE' }); assert.equal(end.phase, 'ended');
                    assert.equal(payoff.utility, end.winner === 'draw' ? 0 : end.winner === `p${actor + 1}` ? 1 : -1);
                    assert.equal(payoff.margin, end.players[actor].score - end.players[1 - actor].score); reducerChecks++;
                }
            }
        }
        return values;
    }
    const trainingSamples = hidden.length ? 8 : 1;
    const train = evaluate(trainingSamples, rng(trainingSeed), false);
    assert.ok(Math.abs(train[candidateIndex].shaped - Math.max(...train.map(v => v.shaped))) < 1e-10);
    const evaluation = evaluate(64, rng(seed ^ Math.imul(deal + 1, 104729) ^ Math.imul(swap + 1, 8191)), true);
    rows.push({ deal, swap, hand: view.hand.length, hidden: hidden.length, changed: candidateIndex !== baselineIndex,
        optimism: train[candidateIndex].shaped - evaluation[candidateIndex].shaped,
        heldoutDifference: evaluation[candidateIndex].shaped - evaluation[baselineIndex].shaped,
        heldoutWinDifference: evaluation[candidateIndex].utility - evaluation[baselineIndex].utility, trainingSamples, evaluationSamples: 64 });
}
const started = performance.now();
for (let deal = 0; deal < deals; deal++) {
    const setup = rng(seed + Math.imul(deal + 1, 2654435761)), deck = shuffle(createDeck(), setup);
    const dice = Array.from({ length: 5 }, () => 1 + Math.floor(setup() * 6)).sort((a, b) => b - a);
    for (const swap of [0, 1]) {
        const initialDeck = swap ? [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)] : deck;
        let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck, initialDice: dice, startingPlayer: swap } });
        state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: swap } });
        const random = rng(seed + deal * 257);
        while (state.phase === 'playing') {
            const actor = state.currentPlayerIndex as 0 | 1, own = state.players[actor];
            if (terminalReplyView(state, actor)) inspect(state, deal, swap);
            let best = -Infinity, chosen = own.hand[0], column = -1;
            for (const card of own.hand) for (let col = 0; col < 5; col++) {
                if (own.board[2][col]) continue;
                const score = scoreGtoMove(state, actor, card, col, XY_GTO_A7) + (random() - 0.5) * 3;
                if (score > best) { best = score; chosen = card; column = col; }
            }
            const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId: chosen.id, colIndex: column, isHidden: random() < getGtoHideProbability(state, actor, chosen, column, XY_GTO_A7) } });
            assert.notEqual(next, state); state = next; generatedMoves++;
        }
    }
}
function paired(key: 'optimism' | 'heldoutDifference' | 'heldoutWinDifference') {
    const values = Array.from({ length: deals }, (_, i) => rows.filter(r => r.deal === i).reduce((s, r) => s + r[key], 0) / 2);
    const mean = values.reduce((s, v) => s + v, 0) / deals;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (deals - 1);
    const half = variance > 0 ? 1.96 * Math.sqrt(variance / deals) : null;
    return { pairs: deals, mean, normal95: half === null ? null : [mean - half, mean + half] };
}
assert.equal(rows.length, deals * 2); assert.deepEqual(hashes(), sourceHashes);
const summary = { states: rows.length, changed: rows.filter(r => r.changed).length,
    optimism: paired('optimism'), heldoutDifference: paired('heldoutDifference'), heldoutWinDifference: paired('heldoutWinDifference'),
    heldoutWorse: rows.filter(r => r.heldoutWinDifference < 0).length, heldoutBetter: rows.filter(r => r.heldoutWinDifference > 0).length,
    generatedMoves, worldsChecked, reducerChecks, elapsedMs: performance.now() - started };
writeFileSync(output, JSON.stringify({ seed, deals, complete: true, sourceHashes, protocol: { trajectory: 'A7 placement noise +/-1.5, native concealment, seat-swapped deals', choiceWorlds: 8, fullyVisibleChoiceWorlds: 1, heldoutWorlds: 64, scope: 'Local sampling-bias diagnostic; no A9 match-strength control, no 1000ms budget, no production adoption', utility: 'Win utility plus clamp(scoreDifference/40, +/-0.45), with win-only difference separate' }, summary, rows }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
