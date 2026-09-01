import { writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import {
    analyzeDiceBoard,
    firstEmptyRow,
    getGtoHideProbability,
    getGtoTurnOrderScore,
    scoreGtoMove,
    XY_GTO_A1,
    XY_GTO_A2,
    type GtoPolicyWeights,
} from '../src/logic/gtoPolicy';
import type { Card, GameState } from '../src/logic/types';

type Policy = 'a1' | 'a2' | 'forced_low_rush';

interface MatchResult {
    utility: -1 | 0 | 1;
    scoreDifference: number;
    bonuses: number;
    cheapColumnBonuses: number;
    choseFirst: boolean | null;
}

interface Summary {
    pairedDeals: number;
    meanUtility: number;
    standardError: number;
    lower95: number;
    upper95: number;
    winRate: number;
    drawRate: number;
    averageScoreDifference: number;
    averageBonuses: number;
    averageCheapColumnBonuses: number;
    chooserFirstRate: number | null;
}

const OUTPUT_PATH = 'gto_dice_regime_analysis.json';
const REGIMES = [
    { id: 'polarized_high', dice: [6, 6, 6, 1, 1] },
    { id: 'flat_same_mean', dice: [4, 4, 4, 4, 4] },
    { id: 'ordinary_spread', dice: [6, 5, 4, 2, 1] },
    { id: 'low_compressed', dice: [2, 2, 2, 1, 1] },
] as const;

function readPositiveFlag(name: string, fallback: number): number {
    const argument = process.argv.find(value => value.startsWith(`${name}=`));
    if (!argument) return fallback;
    const value = Number.parseInt(argument.slice(name.length + 1), 10);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be positive.`);
    return value;
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
    return policy === 'a1' ? XY_GTO_A1 : XY_GTO_A2;
}

function choosePolicyMove(
    state: GameState,
    playerIndex: 0 | 1,
    policy: Policy,
    random: () => number,
): { cardId: string; colIndex: number; isHidden: boolean } {
    const player = state.players[playerIndex];
    const weights = weightsFor(policy);
    let targetColumns = [0, 1, 2, 3, 4].filter(column => firstEmptyRow(player, column) !== -1);

    if (policy === 'forced_low_rush') {
        const minimumDie = Math.min(...player.dice);
        const cheapColumns = targetColumns.filter(column => player.dice[column] === minimumDie);
        const unfinishedRushColumn = cheapColumns.find(column => player.board[2][column] === null);
        if (unfinishedRushColumn !== undefined && player.board.flat().filter(Boolean).length < 8) {
            targetColumns = [unfinishedRushColumn];
        }
    }

    let bestCard = player.hand[0];
    let bestColumn = targetColumns[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const card of player.hand) {
        for (const column of targetColumns) {
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

function playMatch(
    rowPolicy: Policy,
    columnPolicy: Policy,
    rowSeat: 0 | 1,
    deck: Card[],
    dice: number[],
    selector: 0 | 1,
    seed: number,
): MatchResult {
    const random = mulberry32(seed);
    let state = gameReducer(INITIAL_GAME_STATE, {
        type: 'START_GAME',
        payload: { initialDeck: deck, initialDice: dice, startingPlayer: selector },
    });
    const selectorPolicy = selector === rowSeat ? rowPolicy : columnPolicy;
    const selectorWeights = weightsFor(selectorPolicy);
    const selectorGoesFirst = selectorPolicy === 'forced_low_rush'
        && analyzeDiceBoard(dice).bonusRaceIndex >= 0.8
        ? true
        : getGtoTurnOrderScore(state.players[selector], selectorWeights) > 0;
    const firstPlayer = selectorGoesFirst ? selector : (1 - selector) as 0 | 1;
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: firstPlayer } });

    let rowCheapBonuses = 0;
    const minimumDie = Math.min(...dice);
    while (state.phase === 'playing') {
        const actor = state.currentPlayerIndex as 0 | 1;
        const policy = actor === rowSeat ? rowPolicy : columnPolicy;
        const move = choosePolicyMove(state, actor, policy, random);
        const completesCheapColumn = actor === rowSeat
            && dice[move.colIndex] === minimumDie
            && firstEmptyRow(state.players[actor], move.colIndex) === 2
            && state.players[1 - actor].board[2][move.colIndex] === null;
        const nextState = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        if (nextState === state) throw new Error(`Illegal move: ${JSON.stringify({ policy, move })}`);
        if (completesCheapColumn) rowCheapBonuses++;
        state = nextState;
    }
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    const rowId = rowSeat === 0 ? 'p1' : 'p2';
    const columnId = rowSeat === 0 ? 'p2' : 'p1';
    return {
        utility: state.winner === rowId ? 1 : state.winner === columnId ? -1 : 0,
        scoreDifference: state.players[rowSeat].score - state.players[1 - rowSeat].score,
        bonuses: state.players[rowSeat].bonusesClaimed,
        cheapColumnBonuses: rowCheapBonuses,
        choseFirst: selector === rowSeat ? firstPlayer === rowSeat : null,
    };
}

function summarize(results: MatchResult[], pairedDeals: number): Summary {
    const utilities = results.map(result => result.utility);
    const meanUtility = utilities.reduce<number>((sum, value) => sum + value, 0) / utilities.length;
    const variance = utilities.reduce<number>((sum, value) => sum + (value - meanUtility) ** 2, 0)
        / Math.max(1, utilities.length - 1);
    const standardError = Math.sqrt(variance / utilities.length);
    const chooserResults = results.filter(result => result.choseFirst !== null);
    return {
        pairedDeals,
        meanUtility,
        standardError,
        lower95: meanUtility - 1.96 * standardError,
        upper95: meanUtility + 1.96 * standardError,
        winRate: results.filter(result => result.utility === 1).length / results.length,
        drawRate: results.filter(result => result.utility === 0).length / results.length,
        averageScoreDifference: results.reduce((sum, result) => sum + result.scoreDifference, 0) / results.length,
        averageBonuses: results.reduce((sum, result) => sum + result.bonuses, 0) / results.length,
        averageCheapColumnBonuses: results.reduce((sum, result) => sum + result.cheapColumnBonuses, 0) / results.length,
        chooserFirstRate: chooserResults.length > 0
            ? chooserResults.filter(result => result.choseFirst).length / chooserResults.length
            : null,
    };
}

function evaluate(
    rowPolicy: Policy,
    columnPolicy: Policy,
    dice: number[],
    pairedDeals: number,
    seed: number,
): Summary {
    const results: MatchResult[] = [];
    for (let deal = 0; deal < pairedDeals; deal++) {
        const chance = mulberry32(mixSeed(seed, deal));
        const deck = shuffledDeck(chance);
        const selector = (chance() < 0.5 ? 0 : 1) as 0 | 1;
        results.push(playMatch(rowPolicy, columnPolicy, 0, deck, dice, selector, mixSeed(seed, deal, 1)));
        results.push(playMatch(
            rowPolicy,
            columnPolicy,
            1,
            swapInitialHands(deck),
            dice,
            (1 - selector) as 0 | 1,
            mixSeed(seed, deal, 2),
        ));
    }
    return summarize(results, pairedDeals);
}

function rounded<T>(value: T): T {
    return JSON.parse(JSON.stringify(value, (_key, item) => (
        typeof item === 'number' ? Number(item.toFixed(6)) : item
    ))) as T;
}

function main(): void {
    const pairedDeals = readPositiveFlag('--deals', 1_000);
    const seed = readPositiveFlag('--seed', 0x44524332);
    const result = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        method: 'paired seat-and-initial-hand swaps with fixed dice regimes and the production reducer',
        utility: '+1 win, 0 draw, -1 loss',
        seed,
        regimes: REGIMES.map((regime, index) => ({
            id: regime.id,
            dice: regime.dice,
            metrics: analyzeDiceBoard([...regime.dice]),
            adaptiveA2VsA1: evaluate('a2', 'a1', [...regime.dice], pairedDeals, mixSeed(seed, index, 1)),
            forcedLowRushVsA2: evaluate(
                'forced_low_rush',
                'a2',
                [...regime.dice],
                pairedDeals,
                mixSeed(seed, index, 2),
            ),
        })),
        limitations: [
            'This is a policy comparison, not full-game exploitability or a proof of exact Nash equilibrium.',
            'The forced-low-rush probe deliberately commits to one cheapest column and is more rigid than A2.',
            'Policies use no opponent hidden-card identities.',
        ],
    };
    const output = rounded(result);
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(output, null, 2));
}

main();
