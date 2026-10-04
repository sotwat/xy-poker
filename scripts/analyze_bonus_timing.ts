import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { firstEmptyRow, getGtoHideProbability, getGtoTurnOrderScore, scoreGtoMove, XY_GTO_A7 } from '../src/logic/gtoPolicy';
import type { Card, GameState } from '../src/logic/types';

function flag(name: string, fallback: number): number {
    const value = Number(process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
    return value;
}
const deals = flag('deals', 1500), seed = flag('seed', 100503201);
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const only = process.argv.find(arg => arg.startsWith('--candidate='))?.slice(12);
const candidates = [
    { id: 'shadow-4', weight: 4, race: false },
    { id: 'shadow-12', weight: 12, race: false },
    { id: 'race-12', weight: 12, race: true },
] as const;
const selected = only ? candidates.filter(candidate => candidate.id === only) : candidates;
if (!selected.length) throw new Error('Unknown timing candidate');
type Candidate = typeof candidates[number];
function randomFor(initial: number): () => number {
    let value = initial >>> 0;
    return () => {
        value = (value + 0x6d2b79f5) >>> 0;
        let bits = Math.imul(value ^ (value >>> 15), value | 1);
        bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
        return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
    };
}
function bonusValue(state: GameState, actor: 0 | 1, column: number, candidate: Candidate): number {
    const own = state.players[actor], opponent = state.players[1 - actor];
    const row = firstEmptyRow(own, column);
    if (row !== 2 || opponent.board[2][column]) return 0;
    const ownRemaining = own.board.flat().filter(card => card === null).length - 1;
    const opponentRemaining = opponent.board.flat().filter(card => card === null).length - 1;
    // A last-placement draw cannot be used; a larger held hand dilutes another option.
    const ownOption = ownRemaining / (ownRemaining + 4) * 4 / own.hand.length;
    const opponentOption = opponentRemaining / (opponentRemaining + 4) * 4 / opponent.hand.length;
    const opponentHeight = opponent.board.reduce((sum, line) => sum + Number(line[column] !== null), 0);
    const urgency = candidate.race && opponentHeight !== 2 ? 0.25 : 1;
    return candidate.weight * urgency * (ownOption + opponentOption);
}
function moveFor(state: GameState, actor: 0 | 1, random: () => number, candidate: Candidate | null) {
    const own = state.players[actor];
    let best = -Infinity, card = own.hand[0], column = 0;
    for (const held of own.hand) for (let col = 0; col < 5; col++) {
        if (own.board[2][col]) continue;
        const score = scoreGtoMove(state, actor, held, col, XY_GTO_A7)
            + (candidate ? bonusValue(state, actor, col, candidate) : 0);
        if (score > best) { best = score; card = held; column = col; }
    }
    return { cardId: card.id, colIndex: column, isHidden: random() < getGtoHideProbability(state, actor, card, column, XY_GTO_A7) };
}
function play(deck: Card[], dice: number[], selector: 0 | 1, actor: 0 | 1, seed: number, candidate: Candidate | null) {
    const random = randomFor(seed);
    let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck: deck, initialDice: dice, startingPlayer: selector } });
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: {
        startingPlayer: getGtoTurnOrderScore(state.players[selector], XY_GTO_A7) > 0 ? selector : 1 - selector,
    } });
    let placements = 0;
    while (state.phase === 'playing') {
        const seat = state.currentPlayerIndex as 0 | 1;
        const move = moveFor(state, seat, random, seat === actor ? candidate : null);
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        if (next === state || ++placements > 30) throw new Error('Illegal timing-policy trajectory');
        state = next;
    }
    if (placements !== 30 || state.phase !== 'scoring') throw new Error('Incomplete timing-policy trajectory');
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    return { utility: state.winner === (actor === 0 ? 'p1' : 'p2') ? 1 : state.winner === 'draw' ? 0 : -1,
        bonuses: state.players[actor].bonusesClaimed, scoreDifference: state.players[actor].score - state.players[1 - actor].score };
}
const sourceHashes = Object.fromEntries(['src/logic/game.ts', 'src/logic/evaluation.ts', 'src/logic/gtoPolicy.ts', 'scripts/analyze_bonus_timing.ts']
    .map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const started = performance.now();
const rows = selected.map(candidate => ({ candidate, pairs: [] as number[], control: [] as number[], bonusDifferences: [] as number[] }));
for (let deal = 0; deal < deals; deal++) {
    const chance = randomFor(seed + deal * 104729);
    const deck = createDeck();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(chance() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const dice = Array.from({ length: 5 }, () => 1 + Math.floor(chance() * 6)).sort((a, b) => b - a);
    const selector = chance() < 0.5 ? 0 : 1;
    const swapped = [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)];
    const control = [play(deck, dice, selector, 0, seed + deal, null), play(swapped, dice, (1 - selector) as 0 | 1, 1, seed + deal, null)];
    for (const row of rows) {
        const games = [play(deck, dice, selector, 0, seed + deal, row.candidate), play(swapped, dice, (1 - selector) as 0 | 1, 1, seed + deal, row.candidate)];
        row.pairs.push((games[0].utility + games[1].utility) / 2);
        row.control.push((control[0].utility + control[1].utility) / 2);
        row.bonusDifferences.push((games[0].bonuses + games[1].bonuses - control[0].bonuses - control[1].bonuses) / 2);
    }
    if ((deal + 1) % 250 === 0) process.stderr.write(`${deal + 1}/${deals} pairs\n`);
}
function summarize(values: number[]) {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const se = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) / values.length) : null;
    return { mean, lower95: se ? mean - 1.96 * se : null, upper95: se ? mean + 1.96 * se : null };
}
const report = { seed, pairedDeals: deals, phase: only ? 'independent selected-candidate check' : 'three-candidate pilot',
    baseline: 'A7 lightweight placements, corrected current reducer/evaluator; no belief search',
    sourceHashes,
    candidates: rows.map(row => ({ ...row.candidate, utility: summarize(row.pairs),
        versusControl: summarize(row.pairs.map((value, index) => value - row.control[index])),
        meanBonusGain: row.bonusDifferences.reduce((sum, value) => sum + value, 0) / deals,
        pairedUtilities: row.pairs, controlPairedUtilities: row.control })),
    elapsedSeconds: (performance.now() - started) / 1000,
    limits: ['Pilot selection intervals are descriptive, with no multiplicity correction.', 'Lightweight policy gains do not establish runtime A9 improvement or a GTO equilibrium.'] };
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, candidates: report.candidates.map(row => ({ ...row, pairedUtilities: undefined, controlPairedUtilities: undefined })) }, null, 2));
