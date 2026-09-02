import { writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { evaluateYHand } from '../src/logic/evaluation';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import {
    analyzeOpeningRank,
    firstEmptyRow,
    getGtoHideProbability,
    getGtoTurnOrderScore,
    scoreGtoMove,
    XY_GTO_A3,
    XY_GTO_A4,
    XY_GTO_A4_SOLVER_BASE,
    XY_GTO_A6,
    type GtoPolicyWeights,
} from '../src/logic/gtoPolicy';
import type { Card, GameState, Rank, YHandType } from '../src/logic/types';

type Policy = 'a3' | 'a4' | 'solver_base' | 'anchor_quarter' | 'anchor_half' | 'anchor_double'
    | 'kicker_half' | 'kicker_double' | 'q_expendable' | 'q_guarded' | 'feature_half'
    | 'resource_half' | 'resource_one' | 'resource_two' | 'resource_four' | 'a6'
    | 'portfolio_015' | 'portfolio_030' | 'portfolio_060' | 'portfolio_120'
    | 'response_zero' | 'response_half' | 'response_negative' | 'response_high'
    | 'response_n025' | 'response_n100' | 'response_n200' | 'defense_combo';

interface GameResult {
    utility: -1 | 0 | 1;
    scoreDifference: number;
    ownScore: number;
    opponentScore: number;
    firstRowRanks: Rank[];
    yHands: Array<{ type: YHandType; kicker: number }>;
    queenTrips: number;
}

const OUTPUT_PATH = 'gto_opening_efficiency_analysis.json';

function readPositiveFlag(name: string, fallback: number): number {
    const argument = process.argv.find(value => value.startsWith(`${name}=`));
    if (!argument) return fallback;
    const parsed = Number.parseInt(argument.slice(name.length + 1), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be positive.`);
    return parsed;
}

function mulberry32(seed: number): () => number {
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

function weightsFor(policy: Policy): Readonly<GtoPolicyWeights> {
    switch (policy) {
        case 'a3': return XY_GTO_A3;
        case 'solver_base': return XY_GTO_A4_SOLVER_BASE;
        case 'a6': return XY_GTO_A6;
        case 'anchor_quarter': return {
            ...XY_GTO_A4,
            openingAnchorEfficiency: (XY_GTO_A4.openingAnchorEfficiency ?? 0) / 4,
            queenConservation: (XY_GTO_A4.queenConservation ?? 0) / 4,
        };
        case 'anchor_half': return {
            ...XY_GTO_A4,
            openingAnchorEfficiency: (XY_GTO_A4.openingAnchorEfficiency ?? 0) / 2,
            queenConservation: (XY_GTO_A4.queenConservation ?? 0) / 2,
        };
        case 'anchor_double': return {
            ...XY_GTO_A4,
            openingAnchorEfficiency: (XY_GTO_A4.openingAnchorEfficiency ?? 0) * 2,
            queenConservation: (XY_GTO_A4.queenConservation ?? 0) * 1.5,
        };
        case 'kicker_half': return { ...XY_GTO_A4, pureStraightKickerEfficiency: 0.5 };
        case 'kicker_double': return { ...XY_GTO_A4, pureStraightKickerEfficiency: 2 };
        case 'feature_half': return {
            ...XY_GTO_A4,
            openingAnchorEfficiency: 0.225,
            pureStraightKickerEfficiency: 0.5,
            queenConservation: 1.5,
        };
        case 'q_expendable': return { ...XY_GTO_A4, queenConservation: 0 };
        case 'q_guarded': return { ...XY_GTO_A4, queenConservation: 5 };
        case 'resource_half': return { ...XY_GTO_A4, completionResourceConservation: 0.5 };
        case 'resource_one': return { ...XY_GTO_A4, completionResourceConservation: 1 };
        case 'resource_two': return { ...XY_GTO_A4, completionResourceConservation: 2 };
        case 'resource_four': return { ...XY_GTO_A4, completionResourceConservation: 4 };
        case 'portfolio_015': return { ...XY_GTO_A6, pureStraightPortfolioEfficiency: 0.15 };
        case 'portfolio_030': return { ...XY_GTO_A6, pureStraightPortfolioEfficiency: 0.3 };
        case 'portfolio_060': return { ...XY_GTO_A6, pureStraightPortfolioEfficiency: 0.6 };
        case 'portfolio_120': return { ...XY_GTO_A6, pureStraightPortfolioEfficiency: 1.2 };
        case 'response_zero': return { ...XY_GTO_A6, opponentResponseScale: 0 };
        case 'response_half': return { ...XY_GTO_A6, opponentResponseScale: 0.5 };
        case 'response_negative': return { ...XY_GTO_A6, opponentResponseScale: -0.5 };
        case 'response_high': return { ...XY_GTO_A6, opponentResponseScale: 1.5 };
        case 'response_n025': return { ...XY_GTO_A6, opponentResponseScale: -0.25 };
        case 'response_n100': return { ...XY_GTO_A6, opponentResponseScale: -1 };
        case 'response_n200': return { ...XY_GTO_A6, opponentResponseScale: -2 };
        case 'defense_combo': return {
            ...XY_GTO_A6,
            opponentResponseScale: -0.5,
            pureStraightPortfolioEfficiency: 0.6,
        };
        default: return XY_GTO_A4;
    }
}

function chooseMove(
    state: GameState,
    playerIndex: 0 | 1,
    policy: Policy,
    random: () => number,
): { cardId: string; colIndex: number; isHidden: boolean } {
    const player = state.players[playerIndex];
    const weights = weightsFor(policy);
    let bestCard = player.hand[0];
    let bestColumn = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const card of player.hand) {
        for (let column = 0; column < 5; column++) {
            if (firstEmptyRow(player, column) === -1) continue;
            const score = scoreGtoMove(state, playerIndex, card, column, weights)
                + (random() - 0.5) * 0.03;
            if (score > bestScore) {
                bestScore = score;
                bestCard = card;
                bestColumn = column;
            }
        }
    }
    return {
        cardId: bestCard.id,
        colIndex: bestColumn,
        isHidden: random() < getGtoHideProbability(state, playerIndex, bestCard, bestColumn, weights),
    };
}

function readBoardResult(
    state: GameState,
    playerIndex: 0 | 1,
): Omit<GameResult, 'utility' | 'scoreDifference' | 'ownScore' | 'opponentScore'> {
    const player = state.players[playerIndex];
    const yHands = player.dice.map((die, column) => evaluateYHand([
        player.board[0][column]!,
        player.board[1][column]!,
        player.board[2][column]!,
    ], die));
    return {
        firstRowRanks: player.board[0].map(card => card!.rank),
        yHands: yHands.map(hand => ({ type: hand.type, kicker: hand.kickers[0] ?? 0 })),
        queenTrips: yHands.filter((hand, column) => (
            hand.type === 'ThreeOfAKind'
            && player.board[0][column]?.rank === 12
        )).length,
    };
}

function playGame(
    ownPolicy: Policy,
    opponentPolicy: Policy,
    ownSeat: 0 | 1,
    deck: Card[],
    dice: number[],
    selector: 0 | 1,
    seed: number,
): GameResult {
    const random = mulberry32(seed);
    let state = gameReducer(INITIAL_GAME_STATE, {
        type: 'START_GAME',
        payload: { initialDeck: deck, initialDice: dice, startingPlayer: selector },
    });
    const selectorPolicy = selector === ownSeat ? ownPolicy : opponentPolicy;
    const selectorFirst = getGtoTurnOrderScore(state.players[selector], weightsFor(selectorPolicy)) > 0;
    state = gameReducer(state, {
        type: 'CHOOSE_TURN_ORDER',
        payload: { startingPlayer: selectorFirst ? selector : 1 - selector },
    });
    while (state.phase === 'playing') {
        const actor = state.currentPlayerIndex as 0 | 1;
        const policy = actor === ownSeat ? ownPolicy : opponentPolicy;
        const move = chooseMove(state, actor, policy, random);
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        if (next === state) throw new Error(`Illegal move: ${JSON.stringify({ policy, move })}`);
        state = next;
    }
    const boardResult = readBoardResult(state, ownSeat);
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    const ownId = ownSeat === 0 ? 'p1' : 'p2';
    const opponentId = ownSeat === 0 ? 'p2' : 'p1';
    return {
        utility: state.winner === ownId ? 1 : state.winner === opponentId ? -1 : 0,
        scoreDifference: state.players[ownSeat].score - state.players[1 - ownSeat].score,
        ownScore: state.players[ownSeat].score,
        opponentScore: state.players[1 - ownSeat].score,
        ...boardResult,
    };
}

function rankCounts(ranks: Rank[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (let rank = 2; rank <= 14; rank++) counts[String(rank)] = 0;
    for (const rank of ranks) counts[String(rank)]++;
    return counts;
}

function evaluatePolicies(
    ownPolicy: Policy,
    opponentPolicy: Policy,
    dice: number[] | null,
    pairedDeals: number,
    seed: number,
) {
    const games: GameResult[] = [];
    const pairedUtilities: number[] = [];
    for (let deal = 0; deal < pairedDeals; deal++) {
        const chance = mulberry32(mixSeed(seed, deal));
        const deck = shuffledDeck(chance);
        const dealDice = dice
            ? [...dice]
            : Array.from({ length: 5 }, () => Math.floor(chance() * 6) + 1).sort((a, b) => b - a);
        const selector = (chance() < 0.5 ? 0 : 1) as 0 | 1;
        const first = playGame(ownPolicy, opponentPolicy, 0, deck, dealDice, selector, mixSeed(seed, deal, 1));
        const second = playGame(
            ownPolicy,
            opponentPolicy,
            1,
            swapInitialHands(deck),
            dealDice,
            (1 - selector) as 0 | 1,
            mixSeed(seed, deal, 2),
        );
        games.push(first, second);
        pairedUtilities.push((first.utility + second.utility) / 2);
    }
    const meanUtility = pairedUtilities.reduce((sum, value) => sum + value, 0) / pairedUtilities.length;
    const variance = pairedUtilities.reduce((sum, value) => sum + (value - meanUtility) ** 2, 0)
        / Math.max(1, pairedUtilities.length - 1);
    const standardError = Math.sqrt(variance / pairedUtilities.length);
    const allYHands = games.flatMap(game => game.yHands);
    const pureStraights = allYHands.filter(hand => (
        hand.type === 'PureStraight' || hand.type === 'PureStraightFlush'
    ));
    const pureKickers = Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
        const high = index + 3;
        return [String(high), pureStraights.filter(hand => hand.kicker === high).length];
    }));
    return {
        ownPolicy,
        opponentPolicy,
        pairedDeals,
        games: games.length,
        meanUtility,
        standardError,
        lower95: meanUtility - 1.96 * standardError,
        upper95: meanUtility + 1.96 * standardError,
        winRate: games.filter(game => game.utility === 1).length / games.length,
        drawRate: games.filter(game => game.utility === 0).length / games.length,
        averageScoreDifference: games.reduce((sum, game) => sum + game.scoreDifference, 0) / games.length,
        catastrophicLossRate: games.filter(game => game.scoreDifference <= -15).length / games.length,
        dominantWinRate: games.filter(game => game.scoreDifference >= 15).length / games.length,
        ownScoreAtMostTwoRate: games.filter(game => game.ownScore <= 2).length / games.length,
        opponentScoreAtMostTwoRate: games.filter(game => game.opponentScore <= 2).length / games.length,
        firstRowRankCounts: rankCounts(games.flatMap(game => game.firstRowRanks)),
        firstRowQueenPerGame: games.flatMap(game => game.firstRowRanks).filter(rank => rank === 12).length / games.length,
        firstRowKingOrTwoPerGame: games.flatMap(game => game.firstRowRanks)
            .filter(rank => rank === 13 || rank === 2).length / games.length,
        queenTripsPerGame: games.reduce((sum, game) => sum + game.queenTrips, 0) / games.length,
        pureStraightPerGame: pureStraights.length / games.length,
        pureStraightAverageKicker: pureStraights.reduce((sum, hand) => sum + hand.kicker, 0)
            / Math.max(1, pureStraights.length),
        pureStraightKickerCounts: pureKickers,
    };
}

function rounded<T>(value: T): T {
    return JSON.parse(JSON.stringify(value, (_key, item) => (
        typeof item === 'number' ? Number(item.toFixed(6)) : item
    ))) as T;
}

function main(): void {
    const pairedDeals = readPositiveFlag('--deals', 2_000);
    const seed = readPositiveFlag('--seed', 0x4f50454e);
    const ranks = Array.from({ length: 13 }, (_, index) => index + 2 as Rank);
    if (process.argv.includes('--portfolio-search')) {
        const result = rounded({
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            method: 'global disjoint Pure Straight card assignment with paired seat/initial-hand matches',
            comparisons: {
                weight015VsA6: evaluatePolicies('portfolio_015', 'a6', null, pairedDeals, mixSeed(seed, 40)),
                weight030VsA6: evaluatePolicies('portfolio_030', 'a6', null, pairedDeals, mixSeed(seed, 40)),
                weight060VsA6: evaluatePolicies('portfolio_060', 'a6', null, pairedDeals, mixSeed(seed, 40)),
                weight120VsA6: evaluatePolicies('portfolio_120', 'a6', null, pairedDeals, mixSeed(seed, 40)),
                weight030VsA4: evaluatePolicies('portfolio_030', 'a4', null, pairedDeals, mixSeed(seed, 41)),
                weight030VsA3: evaluatePolicies('portfolio_030', 'a3', null, pairedDeals, mixSeed(seed, 42)),
            },
        });
        writeFileSync('gto_portfolio_search_analysis.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (process.argv.includes('--response-search')) {
        const result = rounded({
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            method: 'paired sensitivity test of visible-opponent column pressure',
            comparisons: {
                zeroVsA6: evaluatePolicies('response_zero', 'a6', null, pairedDeals, mixSeed(seed, 50)),
                halfVsA6: evaluatePolicies('response_half', 'a6', null, pairedDeals, mixSeed(seed, 50)),
                negativeVsA6: evaluatePolicies('response_negative', 'a6', null, pairedDeals, mixSeed(seed, 50)),
                highVsA6: evaluatePolicies('response_high', 'a6', null, pairedDeals, mixSeed(seed, 50)),
                zeroVsA3: evaluatePolicies('response_zero', 'a3', null, pairedDeals, mixSeed(seed, 51)),
                halfVsA3: evaluatePolicies('response_half', 'a3', null, pairedDeals, mixSeed(seed, 51)),
            },
        });
        writeFileSync('gto_response_pressure_analysis.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (process.argv.includes('--defense-finalists')) {
        const result = rounded({
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            method: 'paired finalist test for opponent-pressure triage and global Pure Straight allocation',
            comparisons: {
                negative025VsA6: evaluatePolicies('response_n025', 'a6', null, pairedDeals, mixSeed(seed, 60)),
                negative050VsA6: evaluatePolicies('response_negative', 'a6', null, pairedDeals, mixSeed(seed, 60)),
                negative100VsA6: evaluatePolicies('response_n100', 'a6', null, pairedDeals, mixSeed(seed, 60)),
                negative200VsA6: evaluatePolicies('response_n200', 'a6', null, pairedDeals, mixSeed(seed, 60)),
                comboVsA6: evaluatePolicies('defense_combo', 'a6', null, pairedDeals, mixSeed(seed, 60)),
                comboVsNegative050: evaluatePolicies('defense_combo', 'response_negative', null, pairedDeals, mixSeed(seed, 61)),
                negative050VsA3: evaluatePolicies('response_negative', 'a3', null, pairedDeals, mixSeed(seed, 62)),
            },
        });
        writeFileSync('gto_defense_finalists_analysis.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (process.argv.includes('--response-confirmation')) {
        const result = rounded({
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            method: 'independent paired confirmation of column-triage response pressure',
            selectedScale: -2,
            comparisons: {
                randomVsA6: evaluatePolicies('response_n200', 'a6', null, pairedDeals, mixSeed(seed, 70)),
                polarized66611VsA6: evaluatePolicies('response_n200', 'a6', [6, 6, 6, 1, 1], pairedDeals, mixSeed(seed, 71)),
                spread65421VsA6: evaluatePolicies('response_n200', 'a6', [6, 5, 4, 2, 1], pairedDeals, mixSeed(seed, 72)),
                flat44444VsA6: evaluatePolicies('response_n200', 'a6', [4, 4, 4, 4, 4], pairedDeals, mixSeed(seed, 73)),
                vsNegative100: evaluatePolicies('response_n200', 'response_n100', null, pairedDeals, mixSeed(seed, 74)),
                vsNegative025: evaluatePolicies('response_n200', 'response_n025', null, pairedDeals, mixSeed(seed, 75)),
                vsA3: evaluatePolicies('response_n200', 'a3', null, pairedDeals, mixSeed(seed, 76)),
            },
        });
        writeFileSync('gto_response_confirmation_analysis.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (process.argv.includes('--blowout-audit')) {
        const result = rounded({
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            method: 'paired large-margin and low-score audit of A7 column triage',
            comparisons: {
                a7VsA6: evaluatePolicies('response_n200', 'a6', null, pairedDeals, mixSeed(seed, 80)),
                a7VsA3: evaluatePolicies('response_n200', 'a3', null, pairedDeals, mixSeed(seed, 81)),
            },
            thresholds: {
                catastrophicMargin: -15,
                dominantMargin: 15,
                lowFinalScore: 2,
            },
        });
        writeFileSync('gto_a7_blowout_analysis.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (process.argv.includes('--resource-finalists')) {
        const result = rounded({
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            method: 'paired seat/initial-hand comparison of cross-column completion-resource shadow pricing',
            testedWeight: 2,
            comparisons: {
                randomVsA4: evaluatePolicies('resource_two', 'a4', null, pairedDeals, mixSeed(seed, 20)),
                halfRandomVsA4: evaluatePolicies('resource_half', 'a4', null, pairedDeals, mixSeed(seed, 20)),
                polarized66611VsA4: evaluatePolicies('resource_two', 'a4', [6, 6, 6, 1, 1], pairedDeals, mixSeed(seed, 21)),
                halfPolarized66611VsA4: evaluatePolicies('resource_half', 'a4', [6, 6, 6, 1, 1], pairedDeals, mixSeed(seed, 21)),
                spread65421VsA4: evaluatePolicies('resource_two', 'a4', [6, 5, 4, 2, 1], pairedDeals, mixSeed(seed, 22)),
                halfSpread65421VsA4: evaluatePolicies('resource_half', 'a4', [6, 5, 4, 2, 1], pairedDeals, mixSeed(seed, 22)),
                flat44444VsA4: evaluatePolicies('resource_two', 'a4', [4, 4, 4, 4, 4], pairedDeals, mixSeed(seed, 23)),
                halfFlat44444VsA4: evaluatePolicies('resource_half', 'a4', [4, 4, 4, 4, 4], pairedDeals, mixSeed(seed, 23)),
                randomVsHalf: evaluatePolicies('resource_two', 'resource_half', null, pairedDeals, mixSeed(seed, 24)),
                randomVsFour: evaluatePolicies('resource_two', 'resource_four', null, pairedDeals, mixSeed(seed, 25)),
            },
            limitations: [
                'This evaluates the deterministic policy prior, not the complete information-set rollout search.',
                'Confidence intervals measure deal sampling only; they are not a proof of full-game exploitability.',
            ],
        });
        writeFileSync('gto_resource_conservation_analysis.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (process.argv.includes('--finalists-only')) {
        const finalistSeed = mixSeed(seed, 0x46494e41);
        const result = rounded({
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            method: 'paired finalist comparison with common chance seeds',
            openingRankMetrics: ranks.map(analyzeOpeningRank),
            a4Parameters: XY_GTO_A4,
            finalistComparisons: {
                fullVsSolverBase: evaluatePolicies('a4', 'solver_base', null, pairedDeals, finalistSeed),
                halfVsSolverBase: evaluatePolicies('feature_half', 'solver_base', null, pairedDeals, finalistSeed),
                fullVsHalf: evaluatePolicies('a4', 'feature_half', null, pairedDeals, finalistSeed),
                solverBaseVsA3: evaluatePolicies('solver_base', 'a3', null, pairedDeals, finalistSeed),
                halfVsA3: evaluatePolicies('feature_half', 'a3', null, pairedDeals, finalistSeed),
                fullVsA3: evaluatePolicies('a4', 'a3', null, pairedDeals, finalistSeed),
            },
        });
        writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    const result = rounded({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        method: 'exact positional route enumeration plus paired seat/initial-hand policy matches',
        openingRankMetrics: ranks.map(analyzeOpeningRank),
        a4Parameters: XY_GTO_A4,
        a4VsA3: {
            randomDice: evaluatePolicies('a4', 'a3', null, pairedDeals, mixSeed(seed, 1)),
            polarizedHigh66611: evaluatePolicies('a4', 'a3', [6, 6, 6, 1, 1], pairedDeals, mixSeed(seed, 2)),
            ordinarySpread65421: evaluatePolicies('a4', 'a3', [6, 5, 4, 2, 1], pairedDeals, mixSeed(seed, 3)),
            lowCompressed22211: evaluatePolicies('a4', 'a3', [2, 2, 2, 1, 1], pairedDeals, mixSeed(seed, 4)),
        },
        sensitivityVsA4: {
            solverBase: evaluatePolicies('solver_base', 'a4', null, pairedDeals, mixSeed(seed, 5)),
            halfAllFeatures: evaluatePolicies('feature_half', 'a4', null, pairedDeals, mixSeed(seed, 5)),
            halfStrength: evaluatePolicies('anchor_half', 'a4', null, pairedDeals, mixSeed(seed, 5)),
            doubleStrength: evaluatePolicies('anchor_double', 'a4', null, pairedDeals, mixSeed(seed, 6)),
            qExpendable: evaluatePolicies('q_expendable', 'a4', null, pairedDeals, mixSeed(seed, 7)),
            qGuarded: evaluatePolicies('q_guarded', 'a4', null, pairedDeals, mixSeed(seed, 8)),
        },
        parameterSearchVsA3: {
            solverBase: evaluatePolicies('solver_base', 'a3', null, pairedDeals, mixSeed(seed, 9)),
            halfAllFeatures: evaluatePolicies('feature_half', 'a3', null, pairedDeals, mixSeed(seed, 9)),
            quarterAnchor: evaluatePolicies('anchor_quarter', 'a3', null, pairedDeals, mixSeed(seed, 9)),
            halfAnchor: evaluatePolicies('anchor_half', 'a3', null, pairedDeals, mixSeed(seed, 9)),
            currentA4: evaluatePolicies('a4', 'a3', null, pairedDeals, mixSeed(seed, 9)),
            doubleAnchor: evaluatePolicies('anchor_double', 'a3', null, pairedDeals, mixSeed(seed, 9)),
            halfKicker: evaluatePolicies('kicker_half', 'a3', null, pairedDeals, mixSeed(seed, 9)),
            doubleKicker: evaluatePolicies('kicker_double', 'a3', null, pairedDeals, mixSeed(seed, 9)),
            qExpendable: evaluatePolicies('q_expendable', 'a3', null, pairedDeals, mixSeed(seed, 9)),
            qGuarded: evaluatePolicies('q_guarded', 'a3', null, pairedDeals, mixSeed(seed, 9)),
        },
        limitations: [
            'The first-row route metric is exact for current Pure Straight rules, but policy match estimates retain sampling error.',
            'A4 treats the reported QT9 example as Q-J-10 because Q-10-9 is not consecutive under the current evaluator.',
            'Q conservation is an opportunity cost, not a hard ban: a completed high-value column can still outweigh an unused anchor.',
            'A4-versus-A3 is a policy comparison, not proof of exact full-game Nash equilibrium.',
        ],
    });
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(result, null, 2));
}

main();
