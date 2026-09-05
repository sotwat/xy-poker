import { performance } from 'node:perf_hooks';
import {
    DEFAULT_AI_PARAMS,
    getBestMove,
    getBestTurnOrder,
    getLastAiDecisionDiagnostics,
} from '../src/logic/ai';
import { createDeck } from '../src/logic/deck';
import { evaluateXHand, evaluateYHand } from '../src/logic/evaluation';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import {
    getGtoHideProbability,
    getGtoTurnOrderScore,
    scoreGtoMove,
    XY_GTO_A2,
    XY_GTO_A3,
    XY_GTO_A4,
    XY_GTO_A4_SOLVER_BASE,
    XY_GTO_A6,
    XY_GTO_A7,
    type GtoPolicyWeights,
} from '../src/logic/gtoPolicy';
import type { Card, GameState } from '../src/logic/types';

interface MatchResult {
    utility: -1 | 0 | 1;
    scoreDifference: number;
    decisionMs: number[];
    beliefSamples: number[];
    opponentDecisionMs: number[];
    opponentCompletedSamples: number[];
    leverageAudit: LeverageMatchAudit | null;
}

type LeverageStage = 'opening' | 'middle' | 'closing';

interface LeverageDecision {
    selectedColumn: number;
    availableColumns: number[];
    stage: LeverageStage;
}

interface LeverageMatchAudit {
    dice: number[];
    columnLeverages: number[];
    decisions: LeverageDecision[];
}

const auditLeverage = process.argv.includes('--audit-leverage');

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

function readOpponent(): {
    name: string;
    weights: readonly Readonly<GtoPolicyWeights>[];
    policyGeneration?: 'a6' | 'a7' | 'a8';
} {
    const argument = process.argv.find(value => value.startsWith('--opponent='));
    const id = argument?.slice('--opponent='.length) ?? 'a2';
    if (id === 'a2') return { name: 'XY-GTO-A2 one-step policy', weights: [XY_GTO_A2] };
    if (id === 'a3') return { name: 'XY-GTO-A3 one-step policy', weights: [XY_GTO_A3] };
    if (id === 'a4') return { name: 'XY-GTO-A4 one-step policy', weights: [XY_GTO_A4] };
    if (id === 'a6') return {
        name: 'XY-GTO-A6 one-step policy',
        weights: [XY_GTO_A6],
        policyGeneration: 'a6',
    };
    if (id === 'a7') return {
        name: 'XY-GTO-A7 one-step policy',
        weights: [XY_GTO_A7],
        policyGeneration: 'a7',
    };
    if (id === 'a8') return {
        name: 'XY-GTO-A8 certified-endgame search',
        weights: [XY_GTO_A7],
        policyGeneration: 'a8',
    };
    if (id === 'solver-base') return {
        name: 'XY-GTO-A4 solver-base one-step policy',
        weights: [XY_GTO_A4_SOLVER_BASE],
    };
    if (id === 'ensemble') return {
        name: 'A4 / solver-base / A3 / A2 rotating one-step ensemble',
        weights: [XY_GTO_A4, XY_GTO_A4_SOLVER_BASE, XY_GTO_A3, XY_GTO_A2],
    };
    throw new Error('--opponent must be a2, a3, a4, a6, a7, a8, solver-base, or ensemble.');
}

function readPolicyGeneration(): 'a6' | 'a7' | 'a8' {
    const argument = process.argv.find(value => value.startsWith('--policy='));
    const generation = argument?.slice('--policy='.length) ?? DEFAULT_AI_PARAMS.policyGeneration;
    if (generation === 'a6' || generation === 'a7' || generation === 'a8') return generation;
    throw new Error('--policy must be a6, a7, or a8.');
}

function readSearchMode(): { generalizedSearch: boolean; multiPolicyRollouts: boolean; name: string } {
    const argument = process.argv.find(value => value.startsWith('--search='));
    const mode = argument?.slice('--search='.length) ?? 'generalized';
    if (mode === 'generalized') return {
        generalizedSearch: true,
        multiPolicyRollouts: true,
        name: 'A7 generalized multi-policy search',
    };
    if (mode === 'broad') return {
        generalizedSearch: true,
        multiPolicyRollouts: false,
        name: 'A7 broad-action single-policy search',
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

function matchEquity(scoreDifference: number): number {
    return scoreDifference > 0 ? 1 : scoreDifference < 0 ? 0 : 0.5;
}

function compareYColumns(ownCards: Card[], opponentCards: Card[], die: number): -1 | 0 | 1 {
    const own = evaluateYHand(ownCards, die);
    const opponent = evaluateYHand(opponentCards, die);
    if (own.rankValue !== opponent.rankValue) return own.rankValue > opponent.rankValue ? 1 : -1;
    for (let index = 0; index < Math.max(own.kickers.length, opponent.kickers.length); index++) {
        const difference = (own.kickers[index] ?? 0) - (opponent.kickers[index] ?? 0);
        if (difference !== 0) return difference > 0 ? 1 : -1;
    }
    return 0;
}

function terminalLeverageAudit(
    state: GameState,
    playerIndex: 0 | 1,
    decisions: LeverageDecision[],
): LeverageMatchAudit | null {
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];
    const ownX = evaluateXHand(player.board[2] as Card[]);
    const opponentX = evaluateXHand(opponent.board[2] as Card[]);
    if (ownX.type === 'RoyalFlush' || opponentX.type === 'RoyalFlush') return null;

    const scoreDifference = player.score - opponent.score;
    const columnLeverages = player.dice.map((die, column) => {
        const columnResult = compareYColumns(
            player.board.map(row => row[column] as Card),
            opponent.board.map(row => row[column] as Card),
            die,
        );
        const remainder = scoreDifference - die * columnResult;
        return matchEquity(remainder + die) - matchEquity(remainder - die);
    });
    return { dice: [...player.dice], columnLeverages, decisions };
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
    opponentTimeBudgetMs: number,
    opponentBeliefSamples: number,
    opponentWeights: Readonly<GtoPolicyWeights>,
    searchMode: ReturnType<typeof readSearchMode>,
    policyGeneration: 'a6' | 'a7' | 'a8',
    searchOpponentGeneration: 'a6' | 'a7' | 'a8' | null,
): MatchResult {
    const random = seededRandom(seed);
    const originalRandom = Math.random;
    Math.random = random;
    try {
        let state = gameReducer(INITIAL_GAME_STATE, {
            type: 'START_GAME',
            payload: { initialDeck: deck, initialDice: dice, startingPlayer: selector },
        });
        const selectorGeneration = selector === rolloutSeat
            ? policyGeneration
            : searchOpponentGeneration;
        const chooserGoesFirst = selectorGeneration
            ? getBestTurnOrder(state, selector, { ...DEFAULT_AI_PARAMS, policyGeneration: selectorGeneration })
            : getGtoTurnOrderScore(state.players[selector], opponentWeights) > 0;
        state = gameReducer(state, {
            type: 'CHOOSE_TURN_ORDER',
            payload: { startingPlayer: chooserGoesFirst ? selector : 1 - selector },
        });

        const decisionMs: number[] = [];
        const completedBeliefs: number[] = [];
        const opponentDecisionMs: number[] = [];
        const opponentCompletedSamples: number[] = [];
        const leverageDecisions: LeverageDecision[] = [];
        while (state.phase === 'playing') {
            const actor = state.currentPlayerIndex as 0 | 1;
            const actorGeneration = actor === rolloutSeat
                ? policyGeneration
                : searchOpponentGeneration;
            const actorTimeBudgetMs = actor === rolloutSeat ? timeBudgetMs : opponentTimeBudgetMs;
            const actorBeliefSamples = actor === rolloutSeat ? beliefSamples : opponentBeliefSamples;
            const move = actorGeneration
                ? getBestMove(state, actor, {
                    ...DEFAULT_AI_PARAMS,
                    timeBudgetMs: actorTimeBudgetMs,
                    mcSimulations: actorBeliefSamples,
                    generalizedSearch: searchMode.generalizedSearch,
                    multiPolicyRollouts: searchMode.multiPolicyRollouts,
                    policyGeneration: actorGeneration,
                })
                : policyMove(state, actor, random, opponentWeights);
            if (actor === rolloutSeat) {
                const diagnostics = getLastAiDecisionDiagnostics();
                decisionMs.push(diagnostics.elapsedMs);
                completedBeliefs.push(diagnostics.completedBeliefSamples);
                if (auditLeverage) {
                    const occupied = state.players[actor].board.flat().filter(Boolean).length;
                    const stage = occupied < 5 ? 'opening' : occupied < 10 ? 'middle' : 'closing';
                    leverageDecisions.push({
                        selectedColumn: move.colIndex,
                        availableColumns: [0, 1, 2, 3, 4].filter(
                            column => state.players[actor].board[2][column] === null,
                        ),
                        stage,
                    });
                }
            } else if (actorGeneration) {
                const diagnostics = getLastAiDecisionDiagnostics();
                opponentDecisionMs.push(diagnostics.elapsedMs);
                opponentCompletedSamples.push(diagnostics.completedBeliefSamples);
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
            opponentDecisionMs,
            opponentCompletedSamples,
            leverageAudit: auditLeverage
                ? terminalLeverageAudit(state, rolloutSeat, leverageDecisions)
                : null,
        };
    } finally {
        Math.random = originalRandom;
    }
}

const deals = readPositiveFlag('--deals', 20);
const timeBudgetMs = readPositiveFlag('--time-ms', DEFAULT_AI_PARAMS.timeBudgetMs);
const beliefSamples = readPositiveFlag('--samples', DEFAULT_AI_PARAMS.mcSimulations);
const opponentTimeBudgetMs = readPositiveFlag('--opponent-time-ms', timeBudgetMs);
const opponentBeliefSamples = readPositiveFlag('--opponent-samples', beliefSamples);
const benchmarkSeed = readPositiveFlag('--seed', 0x58594232);
const fixedDice = readDiceFlag();
const opponent = readOpponent();
const searchMode = readSearchMode();
const policyGeneration = readPolicyGeneration();
const searchOpponentGeneration = process.argv.includes('--search-opponent')
    ? opponent.policyGeneration ?? null
    : null;
if (process.argv.includes('--search-opponent') && !searchOpponentGeneration) {
    throw new Error('--search-opponent requires --opponent=a6, a7, or a8.');
}
const results: MatchResult[] = [];
const startedAt = performance.now();

for (let deal = 0; deal < deals; deal++) {
    const chance = seededRandom(mixSeed(benchmarkSeed, deal));
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
        opponentTimeBudgetMs,
        opponentBeliefSamples,
        opponentWeights,
        searchMode,
        policyGeneration,
        searchOpponentGeneration,
    ));
    results.push(playMatch(
        swapInitialHands(deck),
        dice,
        (1 - selector) as 0 | 1,
        1,
        mixSeed(deal, 2),
        timeBudgetMs,
        beliefSamples,
        opponentTimeBudgetMs,
        opponentBeliefSamples,
        opponentWeights,
        searchMode,
        policyGeneration,
        searchOpponentGeneration,
    ));
    if (process.argv.includes('--progress')) {
        process.stderr.write(`${deal + 1}/${deals} pairs: ${results.filter(result => result.utility === 1).length} wins, ${results.filter(result => result.utility === -1).length} losses\n`);
    }
}

const decisionTimes = results.flatMap(result => result.decisionMs).sort((a, b) => a - b);
const completedBeliefs = results.flatMap(result => result.beliefSamples);
const wins = results.filter(result => result.utility === 1).length;
const losses = results.filter(result => result.utility === -1).length;
const draws = results.length - wins - losses;
const pairedUtilities = Array.from({ length: deals }, (_, index) => (
    (results[index * 2].utility + results[index * 2 + 1].utility) / 2
));
const pairedMean = pairedUtilities.reduce((sum, value) => sum + value, 0) / pairedUtilities.length;
const pairedVariance = pairedUtilities.length > 1
    ? pairedUtilities.reduce((sum, value) => sum + (value - pairedMean) ** 2, 0)
        / (pairedUtilities.length - 1)
    : 0;
const pairedStandardError = Math.sqrt(pairedVariance / pairedUtilities.length);
const leverageObservationsFor = (audit: LeverageMatchAudit | null) => {
    if (!audit) return [];
    return audit.decisions.map(decision => {
        const available = decision.availableColumns.map(column => audit.columnLeverages[column]);
        const selected = audit.columnLeverages[decision.selectedColumn];
        const maximum = Math.max(...available);
        return {
            stage: decision.stage,
            selected,
            availableMean: available.reduce((sum, value) => sum + value, 0) / available.length,
            selectedPivotal: selected > 0 ? 1 : 0,
            availablePivotal: available.filter(value => value > 0).length / available.length,
            selectedTop: selected === maximum ? 1 : 0,
            randomTop: available.filter(value => value === maximum).length / available.length,
        };
    });
};
const leverageObservations = results.flatMap(result => leverageObservationsFor(result.leverageAudit));
const summarizeLeverage = (observations: typeof leverageObservations) => ({
    decisions: observations.length,
    selectedMean: observations.reduce((sum, value) => sum + value.selected, 0) / observations.length,
    randomAvailableMean: observations.reduce((sum, value) => sum + value.availableMean, 0) / observations.length,
    meanLift: observations.reduce((sum, value) => sum + value.selected - value.availableMean, 0)
        / observations.length,
    selectedPivotalRate: observations.reduce((sum, value) => sum + value.selectedPivotal, 0)
        / observations.length,
    randomAvailablePivotalRate: observations.reduce((sum, value) => sum + value.availablePivotal, 0)
        / observations.length,
    selectedTopRate: observations.reduce((sum, value) => sum + value.selectedTop, 0) / observations.length,
    randomTopRate: observations.reduce((sum, value) => sum + value.randomTop, 0) / observations.length,
});
const pairedLeverageLifts = Array.from({ length: deals }, (_, index) => {
    const pair = results.slice(index * 2, index * 2 + 2).map(result => result.leverageAudit);
    if (pair.some(audit => audit === null)) return null;
    return pair.reduce((sum, audit) => {
        const observations = leverageObservationsFor(audit);
        return sum + observations.reduce(
            (total, value) => total + value.selected - value.availableMean,
            0,
        ) / observations.length;
    }, 0) / pair.length;
}).filter((value): value is number => value !== null);
const pairedLeverageMean = pairedLeverageLifts.reduce((sum, value) => sum + value, 0)
    / pairedLeverageLifts.length;
const pairedLeverageVariance = pairedLeverageLifts.length > 1
    ? pairedLeverageLifts.reduce((sum, value) => sum + (value - pairedLeverageMean) ** 2, 0)
        / (pairedLeverageLifts.length - 1)
    : 0;
const pairedLeverageStandardError = Math.sqrt(pairedLeverageVariance / pairedLeverageLifts.length);
console.log(JSON.stringify({
    pairedUtilities,
    opponent: opponent.name,
    opponentSearch: searchOpponentGeneration !== null,
    search: `${searchMode.name} (${policyGeneration.toUpperCase()} policy)`,
    dice: fixedDice ?? 'random',
    seed: benchmarkSeed,
    pairedDeals: deals,
    games: results.length,
    rolloutWins: wins,
    policyWins: losses,
    draws,
    rolloutScore: (wins + draws * 0.5) / results.length,
    candidate: { timeBudgetMs, beliefSamples },
    searchOpponent: searchOpponentGeneration === null ? null : {
        timeBudgetMs: opponentTimeBudgetMs,
        beliefSamples: opponentBeliefSamples,
    },
    meanUtility: results.reduce((sum, result) => sum + result.utility, 0) / results.length,
    pairedUtility: {
        mean: pairedMean,
        standardError: pairedStandardError,
        lower95: pairedMean - 1.96 * pairedStandardError,
        upper95: pairedMean + 1.96 * pairedStandardError,
    },
    averageScoreDifference: results.reduce((sum, result) => sum + result.scoreDifference, 0) / results.length,
    averageDecisionMs: decisionTimes.reduce((sum, value) => sum + value, 0) / decisionTimes.length,
    p90DecisionMs: decisionTimes[Math.floor(decisionTimes.length * 0.9)],
    averageCompletedBeliefSamples: completedBeliefs.reduce((sum, value) => sum + value, 0) / completedBeliefs.length,
    minimumCompletedBeliefSamples: Math.min(...completedBeliefs),
    opponentAverageDecisionMs: searchOpponentGeneration
        ? results.flatMap(result => result.opponentDecisionMs).reduce((sum, value) => sum + value, 0) / decisionTimes.length
        : null,
    opponentAverageCompletedBeliefSamples: searchOpponentGeneration
        ? results.flatMap(result => result.opponentCompletedSamples).reduce((sum, value) => sum + value, 0) / completedBeliefs.length
        : null,
    leverageAudit: auditLeverage ? {
        eligibleMatches: results.filter(result => result.leverageAudit !== null).length,
        excludedRoyalMatches: results.filter(result => result.leverageAudit === null).length,
        overall: summarizeLeverage(leverageObservations),
        pairedDealMeanLift: {
            pairs: pairedLeverageLifts.length,
            mean: pairedLeverageMean,
            standardError: pairedLeverageStandardError,
            lower95: pairedLeverageMean - 1.96 * pairedLeverageStandardError,
            upper95: pairedLeverageMean + 1.96 * pairedLeverageStandardError,
        },
        byStage: Object.fromEntries((['opening', 'middle', 'closing'] as const).map(stage => [
            stage,
            summarizeLeverage(leverageObservations.filter(value => value.stage === stage)),
        ])),
    } : null,
    runtimeSeconds: (performance.now() - startedAt) / 1_000,
}, null, 2));
