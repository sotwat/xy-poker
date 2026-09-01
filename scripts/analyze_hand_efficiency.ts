import { writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { evaluateYHand } from '../src/logic/evaluation';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import {
    firstEmptyRow,
    getGtoHideProbability,
    getGtoTurnOrderScore,
    scoreGtoMove,
    XY_GTO_A2,
    XY_GTO_A3,
    type GtoPolicyWeights,
} from '../src/logic/gtoPolicy';
import type { Card, GameState, YHandType } from '../src/logic/types';

type Policy = 'a2' | 'a3' | 'pure_conservative' | 'pure_aggressive';

interface GameResult {
    utility: -1 | 0 | 1;
    scoreDifference: number;
    ownYHands: YHandType[];
    opponentYHands: YHandType[];
}

const OUTPUT_PATH = 'gto_hand_efficiency_analysis.json';
const Y_HAND_ORDER: YHandType[] = [
    'HighCard',
    'OnePair',
    'Straight',
    'PureOnePair',
    'Flush',
    'PureStraight',
    'StraightFlush',
    'ThreeOfAKind',
    'PureStraightFlush',
];

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
    if (policy === 'a2') return XY_GTO_A2;
    if (policy === 'pure_conservative') return { ...XY_GTO_A3, pureStraightEfficiency: 2.5 };
    if (policy === 'pure_aggressive') return { ...XY_GTO_A3, pureStraightEfficiency: 10 };
    return XY_GTO_A3;
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
            const score = scoreGtoMove(state, playerIndex, card, column, weights);
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

function yHands(state: GameState, playerIndex: 0 | 1): YHandType[] {
    const player = state.players[playerIndex];
    return player.dice.map((die, column) => evaluateYHand([
        player.board[0][column]!,
        player.board[1][column]!,
        player.board[2][column]!,
    ], die).type);
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
    const ownYHands = yHands(state, ownSeat);
    const opponentYHands = yHands(state, (1 - ownSeat) as 0 | 1);
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    const ownId = ownSeat === 0 ? 'p1' : 'p2';
    const opponentId = ownSeat === 0 ? 'p2' : 'p1';
    return {
        utility: state.winner === ownId ? 1 : state.winner === opponentId ? -1 : 0,
        scoreDifference: state.players[ownSeat].score - state.players[1 - ownSeat].score,
        ownYHands,
        opponentYHands,
    };
}

function countHands(types: YHandType[]): Record<YHandType, number> {
    return Object.fromEntries(Y_HAND_ORDER.map(type => [
        type,
        types.filter(candidate => candidate === type).length,
    ])) as Record<YHandType, number>;
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
    const ownHands = games.flatMap(game => game.ownYHands);
    const opponentHands = games.flatMap(game => game.opponentYHands);
    const wins = games.filter(game => game.utility === 1).length;
    const draws = games.filter(game => game.utility === 0).length;
    return {
        pairedDeals,
        games: games.length,
        meanUtility,
        standardError,
        lower95: meanUtility - 1.96 * standardError,
        upper95: meanUtility + 1.96 * standardError,
        winRate: wins / games.length,
        drawRate: draws / games.length,
        averageScoreDifference: games.reduce((sum, game) => sum + game.scoreDifference, 0) / games.length,
        ownPolicy,
        opponentPolicy,
        ownYHandFrequency: countHands(ownHands),
        opponentYHandFrequency: countHands(opponentHands),
        ownPureStraightPerGame: ownHands.filter(type => type === 'PureStraight').length / games.length,
        opponentPureStraightPerGame: opponentHands.filter(type => type === 'PureStraight').length / games.length,
    };
}

function enumerateRoleEconomics() {
    const deck = createDeck();
    const counts = countHands([]);
    let orderedDeals = 0;
    for (const first of deck) {
        for (const second of deck) {
            if (second.id === first.id) continue;
            for (const third of deck) {
                if (third.id === first.id || third.id === second.id) continue;
                counts[evaluateYHand([first, second, third], 1).type]++;
                orderedDeals++;
            }
        }
    }
    let lower = 0;
    return Y_HAND_ORDER.map(type => {
        const count = counts[type];
        const categoryEquityVsRandom = (lower + count / 2) / orderedDeals;
        lower += count;
        return { type, count, probability: count / orderedDeals, categoryEquityVsRandom };
    });
}

function targetOuts(prefix: Card[], target: YHandType[]): number {
    const used = new Set(prefix.map(card => card.id));
    return createDeck().filter(card => !used.has(card.id)).filter(card => (
        target.includes(evaluateYHand([...prefix, card], 1).type)
    )).length;
}

function rounded<T>(value: T): T {
    return JSON.parse(JSON.stringify(value, (_key, item) => (
        typeof item === 'number' ? Number(item.toFixed(6)) : item
    ))) as T;
}

function main(): void {
    const pairedDeals = readPositiveFlag('--deals', 2_000);
    const seed = readPositiveFlag('--seed', 0x48414e44);
    const roleEconomics = enumerateRoleEconomics();
    const result = rounded({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        method: 'exact ordered three-card enumeration plus paired seat/initial-hand policy matches',
        orderedThreeCardDeals: 52 * 51 * 50,
        roleEconomics,
        oneCardCompletionExamples: [
            {
                target: 'PureStraight',
                prefix: ['5-hearts', '6-clubs'],
                outs: targetOuts([
                    { id: 'hearts-5', rank: 5, suit: 'hearts' },
                    { id: 'clubs-6', rank: 6, suit: 'clubs' },
                ], ['PureStraight']),
            },
            {
                target: 'ThreeOfAKind',
                prefix: ['5-hearts', '5-clubs'],
                outs: targetOuts([
                    { id: 'hearts-5', rank: 5, suit: 'hearts' },
                    { id: 'clubs-5', rank: 5, suit: 'clubs' },
                ], ['ThreeOfAKind']),
            },
            {
                target: 'PureStraightFlush',
                prefix: ['5-hearts', '6-hearts'],
                outs: targetOuts([
                    { id: 'hearts-5', rank: 5, suit: 'hearts' },
                    { id: 'hearts-6', rank: 6, suit: 'hearts' },
                ], ['PureStraightFlush']),
            },
            {
                target: 'Flush',
                prefix: ['5-hearts', '9-hearts'],
                outs: targetOuts([
                    { id: 'hearts-5', rank: 5, suit: 'hearts' },
                    { id: 'hearts-9', rank: 9, suit: 'hearts' },
                ], ['Flush']),
            },
        ],
        a3VsA2: {
            randomDice: evaluatePolicies('a3', 'a2', null, pairedDeals, mixSeed(seed, 1)),
            polarizedHigh66611: evaluatePolicies('a3', 'a2', [6, 6, 6, 1, 1], pairedDeals, mixSeed(seed, 2)),
            ordinarySpread65421: evaluatePolicies('a3', 'a2', [6, 5, 4, 2, 1], pairedDeals, mixSeed(seed, 3)),
            lowCompressed22211: evaluatePolicies('a3', 'a2', [2, 2, 2, 1, 1], pairedDeals, mixSeed(seed, 4)),
        },
        sensitivityVsA3: {
            conservativeRandomDice: evaluatePolicies(
                'pure_conservative',
                'a3',
                null,
                pairedDeals,
                mixSeed(seed, 5),
            ),
            aggressiveRandomDice: evaluatePolicies(
                'pure_aggressive',
                'a3',
                null,
                pairedDeals,
                mixSeed(seed, 6),
            ),
        },
        limitations: [
            'Category equity uses uniformly random ordered three-card hands and ignores within-category kickers.',
            'Completion outs describe a canonical two-card prefix; actual value also depends on held cards, visible removals, dice, opponent progress, X-hand interactions, and bonus timing.',
            'A3-versus-A2 is a policy comparison, not proof of exact full-game Nash equilibrium.',
        ],
    });
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(result, null, 2));
}

main();
