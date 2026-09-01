import { evaluateXHand, evaluateYHand } from './evaluation';
import type { Card, GameState, PlayerState, Rank } from './types';

export interface GtoPolicyWeights {
    yWeight: number;
    xWeight: number;
    tempoWeight: number;
    diceWeight: number;
    flexibilityWeight: number;
    row3Delay: number;
    concealment: number;
    firstBias: number;
    /** 0 preserves A1; 1 enables full-board dice-regime adaptation. */
    boardAdaptation?: number;
}

/** The original policy-space equilibrium retained as a reproducible baseline. */
export const XY_GTO_A1: Readonly<GtoPolicyWeights> = Object.freeze({
    yWeight: 0.9,
    xWeight: 1.15,
    tempoWeight: 0.5,
    diceWeight: 0.9,
    flexibilityWeight: 1.75,
    row3Delay: 1.9,
    concealment: 0.25,
    firstBias: -0.55,
    boardAdaptation: 0,
});

/** Regime-aware policy. Re-solved and validated by scripts/solve_gto.ts. */
export const XY_GTO_A2: Readonly<GtoPolicyWeights> = Object.freeze({
    ...XY_GTO_A1,
    boardAdaptation: 1,
});

export interface DiceBoardMetrics {
    total: number;
    mean: number;
    variance: number;
    standardDeviation: number;
    range: number;
    normalizedVariance: number;
    bonusRaceIndex: number;
    xValueMultiplier: number;
}

const Y_STRAIGHT_WINDOWS: Rank[][] = [
    [14, 2, 3],
    ...Array.from({ length: 11 }, (_, index) => [index + 2, index + 3, index + 4] as Rank[]),
];
const X_STRAIGHT_WINDOWS: Rank[][] = [
    [14, 2, 3, 4, 5],
    ...Array.from({ length: 9 }, (_, index) => (
        Array.from({ length: 5 }, (__, offset) => index + offset + 2) as Rank[]
    )),
];

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Summarizes the public chance state. Population variance is normalized by 6,
 * the variance of the maximally polarized five-die boards 66611 / 66111.
 */
export function analyzeDiceBoard(dice: number[]): DiceBoardMetrics {
    const validDice = dice.length === 5 && dice.every(value => Number.isFinite(value) && value >= 1 && value <= 6)
        ? dice
        : [3.5, 3.5, 3.5, 3.5, 3.5];
    const total = validDice.reduce((sum, value) => sum + value, 0);
    const mean = total / validDice.length;
    const variance = validDice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / validDice.length;
    const maximum = Math.max(...validDice);
    const minimum = Math.min(...validDice);
    const range = maximum - minimum;
    const normalizedVariance = clamp(variance / 6, 0, 1);
    const normalizedRange = clamp(range / 5, 0, 1);
    const lowColumnGap = clamp((mean - minimum) / 5, 0, 1);
    const highMean = clamp((mean - 3.5) / 2.5, 0, 1);

    // A bonus draw is most attractive when a clearly cheap column can fund
    // optionality for materially more valuable columns. Mean, dispersion and
    // the gap to the cheapest die are deliberately separate features.
    const bonusRaceIndex = clamp(
        normalizedVariance * 0.58
        + normalizedRange * 0.22
        + lowColumnGap * 0.15
        + highMean * 0.10,
        0,
        1,
    );
    const xValueMultiplier = clamp(1 + (3.5 - mean) * 0.28, 0.45, 1.7);

    return {
        total,
        mean,
        variance,
        standardDeviation: Math.sqrt(variance),
        range,
        normalizedVariance,
        bonusRaceIndex,
        xValueMultiplier,
    };
}

export function firstEmptyRow(player: PlayerState, column: number): number {
    return player.board.findIndex(row => row[column] === null);
}

export function getVisibleOpponentCards(player: PlayerState, column: number): Card[] {
    return player.board
        .map(row => row[column])
        .filter((card): card is Card => card !== null && !card.isHidden);
}

function partialYValue(cards: Card[]): number {
    if (cards.length === 3) {
        const result = evaluateYHand(cards, 1);
        return result.rankValue / 9 + (result.kickers[0] ?? 0) / 140;
    }
    if (cards.length === 0) return 0;

    const ranks = cards.map(card => card.rank);
    const sameRank = new Set(ranks).size === 1 && ranks.length === 2 ? 0.62 : 0;
    const sameSuit = new Set(cards.map(card => card.suit)).size === 1 && cards.length === 2 ? 0.34 : 0;
    const compatibleWindows = Y_STRAIGHT_WINDOWS.filter(window => ranks.every(rank => window.includes(rank))).length;
    const orderValue = cards.length === 2 && Math.abs(cards[0].rank - cards[1].rank) === 1 ? 0.16 : 0;
    const highCardValue = Math.max(...ranks) / 70;

    return 0.08 + sameRank + sameSuit + compatibleWindows * 0.08 + orderValue + highCardValue;
}

function partialXValue(cards: Card[]): number {
    if (cards.length === 5) {
        const result = evaluateXHand(cards);
        return result.rankValue / 10 + (result.kickers[0] ?? 0) / 180;
    }
    if (cards.length === 0) return 0;

    const rankCounts = new Map<number, number>();
    const suitCounts = new Map<string, number>();
    for (const card of cards) {
        rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
        suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
    }
    const duplicateValue = [...rankCounts.values()].reduce(
        (total, count) => total + count * (count - 1),
        0,
    ) * 0.12;
    const flushCoverage = Math.max(...suitCounts.values()) / 5;
    const ranks = new Set(cards.map(card => card.rank));
    const straightCoverage = Math.max(...X_STRAIGHT_WINDOWS.map(
        window => window.filter(rank => ranks.has(rank)).length,
    )) / 5;
    return duplicateValue + flushCoverage * 0.38 + straightCoverage * 0.52;
}

function columnFlexibility(cards: Card[]): number {
    const ranks = cards.map(card => card.rank);
    const windows = Y_STRAIGHT_WINDOWS.filter(window => ranks.every(rank => window.includes(rank))).length;
    const suitOptions = cards.length < 2 || new Set(cards.map(card => card.suit)).size === 1 ? 1 : 0;
    return windows * 0.12 + suitOptions * 0.12 + (cards.length < 3 ? 0.12 : 0);
}

function compareCompletedY(ownCards: Card[], opponentCards: Card[]): number {
    if (ownCards.length !== 3 || opponentCards.length !== 3) return 0;
    const own = evaluateYHand(ownCards, 1);
    const opponent = evaluateYHand(opponentCards, 1);
    if (own.rankValue !== opponent.rankValue) return own.rankValue > opponent.rankValue ? 1 : -1;
    const kickerCount = Math.max(own.kickers.length, opponent.kickers.length);
    for (let index = 0; index < kickerCount; index++) {
        const difference = (own.kickers[index] ?? 0) - (opponent.kickers[index] ?? 0);
        if (difference !== 0) return difference > 0 ? 1 : -1;
    }
    return 0;
}

export function getGtoTurnOrderScore(player: PlayerState, weights = XY_GTO_A2): number {
    const ranks = player.hand.map(card => card.rank);
    const duplicateCards = ranks.length - new Set(ranks).size;
    const highCards = ranks.filter(rank => rank >= 11).length;
    const disposableCards = ranks.filter(rank => rank <= 7).length / Math.max(1, ranks.length);
    const metrics = analyzeDiceBoard(player.dice);
    const adaptation = clamp(weights.boardAdaptation ?? 0, 0, 1.5);
    const polarizedFirstMoverValue = adaptation
        * metrics.bonusRaceIndex
        * (0.95 + disposableCards * 0.35);
    return weights.firstBias + duplicateCards * 0.7 + highCards * 0.16
        + polarizedFirstMoverValue - 0.45;
}

export function scoreGtoMove(
    state: GameState,
    playerIndex: 0 | 1,
    card: Card,
    column: number,
    weights = XY_GTO_A2,
): number {
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];
    const row = firstEmptyRow(player, column);
    if (row === -1) return Number.NEGATIVE_INFINITY;

    const ownColumn = player.board
        .map(boardRow => boardRow[column])
        .filter((value): value is Card => value !== null);
    const projectedColumn = [...ownColumn, card];
    const dice = player.dice[column];
    const metrics = analyzeDiceBoard(player.dice);
    const adaptation = clamp(weights.boardAdaptation ?? 0, 0, 1.5);
    const rangeScale = Math.max(1, metrics.range);
    const relativeCheapness = clamp((metrics.mean - dice) / rangeScale, 0, 1);
    const relativeStake = clamp((dice - metrics.mean) / rangeScale, -1, 1);
    const rushPotential = adaptation * metrics.bonusRaceIndex * relativeCheapness;
    const diceScale = 0.45 + (dice / 6) * weights.diceWeight;
    const yValue = partialYValue(projectedColumn) * diceScale * weights.yWeight * 8;

    const bottomCards = player.board[2].filter((value): value is Card => value !== null);
    const xValue = row === 2
        ? partialXValue([...bottomCards, card]) * weights.xWeight * 10
            * (1 + adaptation * (metrics.xValueMultiplier - 1))
        : 0;
    const opponentComplete = opponent.board[2][column] !== null;
    const opponentProgress = opponent.board.reduce(
        (count, boardRow) => count + (boardRow[column] !== null ? 1 : 0),
        0,
    );
    const tempoValue = row === 2 && !opponentComplete
        ? 4.5 * weights.tempoWeight + rushPotential * (5.5 + opponentProgress * 0.45)
        : 0;
    const progressValue = (row + 1) * 0.25 * weights.tempoWeight;
    const rushPlanValue = opponentComplete ? 0 : rushPotential * projectedColumn.length * 1.35;
    const flexibilityValue = columnFlexibility(projectedColumn) * weights.flexibilityWeight * 3;

    const turnProgress = Math.min(1, state.turnCount / 30);
    const row3Penalty = row === 2
        ? weights.row3Delay * (1 - turnProgress) * 3.5 * (1 - Math.min(0.8, rushPotential * 0.8))
        : 0;
    const lowDiceHighCardCost = card.rank >= 11 ? (7 - dice) * 0.16 * weights.diceWeight : 0;
    const cardQuality = (card.rank - 2) / 12;
    const resourceAlignmentValue = adaptation * (cardQuality - 0.5) * relativeStake * 3.2;

    const opponentVisible = getVisibleOpponentCards(opponent, column);
    const showdownValue = compareCompletedY(projectedColumn, opponentVisible) * dice * weights.yWeight;
    const responseValue = opponentVisible.length > 0
        ? opponentVisible.length * partialYValue(opponentVisible) * dice * 0.22 * weights.flexibilityWeight
        : 0;

    return yValue + xValue + tempoValue + progressValue + rushPlanValue + flexibilityValue
        + showdownValue + responseValue + resourceAlignmentValue
        - row3Penalty - lowDiceHighCardCost;
}

export function getGtoHideProbability(
    state: GameState,
    playerIndex: 0 | 1,
    card: Card,
    column: number,
    weights = XY_GTO_A2,
): number {
    const player = state.players[playerIndex];
    if (player.hiddenCardsCount >= 3) return 0;
    const hiddenInColumn = player.board.reduce(
        (count, row) => count + (row[column]?.isHidden ? 1 : 0),
        0,
    );
    if (hiddenInColumn >= 2) return 0;

    const remainingQuota = 3 - player.hiddenCardsCount;
    const emptySpaces = player.board.flat().filter(value => value === null).length;
    if (emptySpaces <= remainingQuota) return 1;

    const row = firstEmptyRow(player, column);
    if (row === -1) return 0;
    const opponent = state.players[1 - playerIndex];
    const opponentProgress = opponent.board.reduce(
        (count, boardRow) => count + (boardRow[column] !== null ? 1 : 0),
        0,
    );
    const ambiguity = row < 2 ? 0.35 : 0.05;
    const bluffValue = card.rank <= 7 ? 0.25 : 0;
    const pressure = player.dice[column] / 12 + opponentProgress * 0.16;
    const completedOpponentDiscount = opponent.board[2][column] !== null ? 0.7 : 0;
    const logit = weights.concealment + ambiguity + bluffValue + pressure
        - completedOpponentDiscount - 1.35;
    return 1 / (1 + Math.exp(-logit * 1.7));
}
