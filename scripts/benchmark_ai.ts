import { performance } from 'node:perf_hooks';
import {
    DEFAULT_AI_PARAMS,
    getBestMove,
    getBestTurnOrder,
    getLastAiDecisionDiagnostics,
} from '../src/logic/ai';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import {
    getGtoHideProbability,
    getGtoTurnOrderScore,
    scoreGtoMove,
    XY_GTO_A2,
    XY_GTO_A3,
    XY_GTO_A4,
    XY_GTO_A4_SOLVER_BASE,
    type GtoPolicyWeights,
} from '../src/logic/gtoPolicy';
import type { Card, GameState } from '../src/logic/types';

interface MatchResult {
    utility: -1 | 0 | 1;
    scoreDifference: number;
    decisionMs: number[];
    beliefSamples: number[];
}

function readPositiveFlag(name: string, fallback: number): number {
    const argument = process.argv.find(value => value.startsWith(`${name}=`));
    if (!argument) return fallback;
    const parsed = Number.parseInt(argument.slice(name.length + 1), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be positive.`);
    return parsed;
}

function readDiceFlag(): number[] | null {
    const argument = process.argv.find(value => value.startsWith('--dice='));
    if (!argument) return null;
    const dice = argument.slice('--dice='.length).split(',').map(Number);
    if (dice.length !== 5 || dice.some(value => !Number.isInteger(value) || value < 1 || value > 6)) {
        throw new Error('--dice must contain five comma-separated integers from 1 to 6.');
    }
    return dice.sort((a, b) => b - a);
}

function readOpponent(): { name: string; weights: readonly Readonly<GtoPolicyWeights>[] } {
    const argument = process.argv.find(value => value.startsWith('--opponent='));
    const id = argument?.slice('--opponent='.length) ?? 'a2';
    if (id === 'a2') return { name: 'XY-GTO-A2 one-step policy', weights: [XY_GTO_A2] };
    if (id === 'a3') return { name: 'XY-GTO-A3 one-step policy', weights: [XY_GTO_A3] };
    if (id === 'a4') return { name: 'XY-GTO-A4 one-step policy', weights: [XY_GTO_A4] };
    if (id === 'solver-base') return {
        name: 'XY-GTO-A4 solver-base one-step policy',
        weights: [XY_GTO_A4_SOLVER_BASE],
    };
    if (id === 'ensemble') return {
        name: 'A4 / solver-base / A3 / A2 rotating one-step ensemble',
        weights: [XY_GTO_A4, XY_GTO_A4_SOLVER_BASE, XY_GTO_A3, XY_GTO_A2],
    };
    throw new Error('--opponent must be a2, a3, a4, solver-base, or ensemble.');
}

function readSearchMode(): { generalizedSearch: boolean; multiPolicyRollouts: boolean; name: string } {
    const argument = process.argv.find(value => value.startsWith('--search='));
    const mode = argument?.slice('--search='.length) ?? 'generalized';
    if (mode === 'generalized') return {
        generalizedSearch: true,
        multiPolicyRollouts: true,
        name: 'A6 generalized multi-policy search',
    };
    if (mode === 'broad') return {
        generalizedSearch: true,
        multiPolicyRollouts: false,
        name: 'A6 broad-action single-policy search',
    };
    if (mode === 'single') return {
        generalizedSearch: false,
        multiPolicyRollouts: false,
        name: 'A4 single-policy search',
    };
    throw new Error('--search must be generalized, broad, or single.');
}

function seededRandom(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value = (value + 0x6d2b79f5) >>> 0;
        let result = value;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
    };
}

function mixSeed(...values: number[]): number {
    let hash = 0x811c9dc5;
    for (const value of values) {
        hash ^= value >>> 0;
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function shuffledDeck(random: () => number): Card[] {
    const deck = createDeck();
    for (let index = deck.length - 1; index > 0; index--) {
        const target = Math.floor(random() * (index + 1));
        [deck[index], deck[target]] = [deck[target], deck[index]];
    }
    return deck;
}

function swapInitialHands(deck: Card[]): Card[] {
    return [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)];
}

function policyMove(
    state: GameState,
    playerIndex: 0 | 1,
    random: () => number,
    opponentWeights: Readonly<GtoPolicyWeights>,
) {
    const player = state.players[playerIndex];
    let best = { cardId: player.hand[0].id, colIndex: 0, isHidden: false };
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const card of player.hand) {
        for (let column = 0; column < 5; column++) {
            if (player.board[2][column] !== null) continue;
            const score = scoreGtoMove(state, playerIndex, card, column, opponentWeights);
            if (score > bestScore) {
                bestScore = score;
                best = {
                    cardId: card.id,
                    colIndex: column,
                    isHidden: random() < getGtoHideProbability(
                        state,
                        playerIndex,
                        card,
                        column,
                        opponentWeights,
                    ),
                };
            }
        }
    }
    return best;
}

function playMatch(
    deck: Card[],
    dice: number[],
    selector: 0 | 1,
    rolloutSeat: 0 | 1,
    seed: number,
    timeBudgetMs: number,
    beliefSamples: number,
    opponentWeights: Readonly<GtoPolicyWeights>,
    searchMode: ReturnType<typeof readSearchMode>,
): MatchResult {
    const random = seededRandom(seed);
    const originalRandom = Math.random;
    Math.random = random;
    try {
        let state = gameReducer(INITIAL_GAME_STATE, {
            type: 'START_GAME',
            payload: { initialDeck: deck, initialDice: dice, startingPlayer: selector },
        });
        const chooserGoesFirst = selector === rolloutSeat
            ? getBestTurnOrder(state, selector)
            : getGtoTurnOrderScore(state.players[selector], opponentWeights) > 0;
        state = gameReducer(state, {
            type: 'CHOOSE_TURN_ORDER',
            payload: { startingPlayer: chooserGoesFirst ? selector : 1 - selector },
        });

        const decisionMs: number[] = [];
        const completedBeliefs: number[] = [];
        while (state.phase === 'playing') {
            const actor = state.currentPlayerIndex as 0 | 1;
            const move = actor === rolloutSeat
                ? getBestMove(state, actor, {
                    ...DEFAULT_AI_PARAMS,
                    timeBudgetMs,
                    mcSimulations: beliefSamples,
                    generalizedSearch: searchMode.generalizedSearch,
                    multiPolicyRollouts: searchMode.multiPolicyRollouts,
                })
                : policyMove(state, actor, random, opponentWeights);
            if (actor === rolloutSeat) {
                const diagnostics = getLastAiDecisionDiagnostics();
                decisionMs.push(diagnostics.elapsedMs);
                completedBeliefs.push(diagnostics.completedBeliefSamples);
            }
            const nextState = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
            if (nextState === state) throw new Error(`Illegal benchmark move: ${JSON.stringify(move)}`);
            state = nextState;
        }
        if (state.phase === 'scoring') state = gameReducer(state, { type: 'CALCULATE_SCORE' });
        const rolloutId = rolloutSeat === 0 ? 'p1' : 'p2';
        const opponentId = rolloutSeat === 0 ? 'p2' : 'p1';
        return {
            utility: state.winner === rolloutId ? 1 : state.winner === opponentId ? -1 : 0,
            scoreDifference: state.players[rolloutSeat].score - state.players[1 - rolloutSeat].score,
            decisionMs,
            beliefSamples: completedBeliefs,
        };
    } finally {
        Math.random = originalRandom;
    }
}

const deals = readPositiveFlag('--deals', 20);
const timeBudgetMs = readPositiveFlag('--time-ms', DEFAULT_AI_PARAMS.timeBudgetMs);
const beliefSamples = readPositiveFlag('--samples', DEFAULT_AI_PARAMS.mcSimulations);
const fixedDice = readDiceFlag();
const opponent = readOpponent();
const searchMode = readSearchMode();
const results: MatchResult[] = [];
const startedAt = performance.now();

for (let deal = 0; deal < deals; deal++) {
    const chance = seededRandom(mixSeed(0x58594232, deal));
    const deck = shuffledDeck(chance);
    const dice = fixedDice
        ? [...fixedDice]
        : Array.from({ length: 5 }, () => Math.floor(chance() * 6) + 1).sort((a, b) => b - a);
    const selector = (chance() < 0.5 ? 0 : 1) as 0 | 1;
    const opponentWeights = opponent.weights[deal % opponent.weights.length];
    results.push(playMatch(
        deck,
        dice,
        selector,
        0,
        mixSeed(deal, 1),
        timeBudgetMs,
        beliefSamples,
        opponentWeights,
        searchMode,
    ));
    results.push(playMatch(
        swapInitialHands(deck),
        dice,
        (1 - selector) as 0 | 1,
        1,
        mixSeed(deal, 2),
        timeBudgetMs,
        beliefSamples,
        opponentWeights,
        searchMode,
    ));
}

const decisionTimes = results.flatMap(result => result.decisionMs).sort((a, b) => a - b);
const completedBeliefs = results.flatMap(result => result.beliefSamples);
const wins = results.filter(result => result.utility === 1).length;
const losses = results.filter(result => result.utility === -1).length;
const draws = results.length - wins - losses;
console.log(JSON.stringify({
    opponent: opponent.name,
    search: searchMode.name,
    dice: fixedDice ?? 'random',
    pairedDeals: deals,
    games: results.length,
    rolloutWins: wins,
    policyWins: losses,
    draws,
    rolloutScore: (wins + draws * 0.5) / results.length,
    meanUtility: results.reduce((sum, result) => sum + result.utility, 0) / results.length,
    averageScoreDifference: results.reduce((sum, result) => sum + result.scoreDifference, 0) / results.length,
    averageDecisionMs: decisionTimes.reduce((sum, value) => sum + value, 0) / decisionTimes.length,
    p90DecisionMs: decisionTimes[Math.floor(decisionTimes.length * 0.9)],
    averageCompletedBeliefSamples: completedBeliefs.reduce((sum, value) => sum + value, 0) / completedBeliefs.length,
    minimumCompletedBeliefSamples: Math.min(...completedBeliefs),
    runtimeSeconds: (performance.now() - startedAt) / 1_000,
}, null, 2));
