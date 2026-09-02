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
    /** Values an ordered straight by strength per scarce rank, not rank alone. */
    pureStraightEfficiency?: number;
    /** Values first-row ranks by route breadth and Pure Straight kicker equity. */
    openingAnchorEfficiency?: number;
    /** Distinguishes A-high Pure Straight plans from weak A-2-3 plans. */
    pureStraightKickerEfficiency?: number;
    /** Opportunity cost of spending a queen away from an available first-row anchor. */
    queenConservation?: number;
    /** Shadow price of consuming the best held completion for another Y column. */
    completionResourceConservation?: number;
    /** Global, disjoint assignment value of held cards to Pure Straight routes. */
    pureStraightPortfolioEfficiency?: number;
    /** Scales the legacy pressure to contest an opponent's visible column. */
    opponentResponseScale?: number;
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
    pureStraightEfficiency: 0,
});

/** Regime-aware policy. Re-solved and validated by scripts/solve_gto.ts. */
export const XY_GTO_A2: Readonly<GtoPolicyWeights> = Object.freeze({
    ...XY_GTO_A1,
    boardAdaptation: 1,
});

/** Hand-efficiency policy. A2 remains frozen as the pre-efficiency baseline. */
export const XY_GTO_A3: Readonly<GtoPolicyWeights> = Object.freeze({
    yWeight: 0.979517,
    xWeight: 0.897687,
    tempoWeight: 0.259471,
    diceWeight: 0.499791,
    flexibilityWeight: 2.5,
    row3Delay: 3,
    concealment: 0.364231,
    firstBias: -0.344567,
    boardAdaptation: 0.751132,
    pureStraightEfficiency: 5,
});

/** Independently confirmed PSRO response used as A4's rebalanced foundation. */
export const XY_GTO_A4_SOLVER_BASE: Readonly<GtoPolicyWeights> = Object.freeze({
    yWeight: 0.617969,
    xWeight: 0.779668,
    tempoWeight: 0.170743,
    diceWeight: 0.3,
    flexibilityWeight: 1.262349,
    row3Delay: 2.20999,
    concealment: -0.143771,
    firstBias: 0.040349,
    boardAdaptation: 0.655002,
    pureStraightEfficiency: 9.109659,
    openingAnchorEfficiency: 0,
    pureStraightKickerEfficiency: 0.005868,
    queenConservation: 0.085263,
});

/** Opening-efficiency policy. A3 remains frozen as the pre-anchor baseline. */
export const XY_GTO_A4: Readonly<GtoPolicyWeights> = Object.freeze({
    ...XY_GTO_A4_SOLVER_BASE,
    openingAnchorEfficiency: 0.45,
    pureStraightKickerEfficiency: 1,
    queenConservation: 3,
});

/** Cross-column resource policy used as the prior and rollout policy for A6. */
export const XY_GTO_A6: Readonly<GtoPolicyWeights> = Object.freeze({
    ...XY_GTO_A4,
    completionResourceConservation: 2,
});

/** Column-triage policy: stop over-investing into strong visible opponent lanes. */
export const XY_GTO_A7: Readonly<GtoPolicyWeights> = Object.freeze({
    ...XY_GTO_A6,
    opponentResponseScale: -2,
});

interface PureStraightPortfolioOption {
    cardIds: string[];
    value: number;
}

export interface PureStraightPortfolio {
    value: number;
    securedColumns: number;
}

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
const PURE_STRAIGHT_SEQUENCES: Rank[][] = [
    [14, 2, 3],
    [3, 2, 14],
    ...Array.from({ length: 11 }, (_, index) => {
        const low = index + 2;
        return [low, low + 1, low + 2] as Rank[];
    }),
    ...Array.from({ length: 11 }, (_, index) => {
        const high = index + 4;
        return [high, high - 1, high - 2] as Rank[];
    }),
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

function effectiveBoardAdaptation(weights: Readonly<GtoPolicyWeights>): number {
    const configured = clamp(weights.boardAdaptation ?? 0, 0, 1.5);
    const handEfficiencyFloor = clamp(weights.pureStraightEfficiency ?? 0, 0, 1);
    return Math.max(configured, handEfficiencyFloor);
}

export interface PureStraightPlan {
    viableSequences: number;
    bestHeldSuffix: number;
    completionOuts: number;
    completionHeld: boolean;
    secured: boolean;
    completed: boolean;
    bestRouteHigh: number;
    bestRouteEquity: number;
    bestHeldRouteHigh: number;
    bestSecuredRouteHigh: number;
    /** A3-compatible route value before within-category kicker strength. */
    baseValue: number;
    value: number;
}

export interface OpeningRankMetrics {
    rank: Rank;
    routeCount: number;
    routeHighs: number[];
    bestHigh: number;
    /** Sum of heads-up equity within the Pure Straight category for every route. */
    routeEquitySum: number;
    /** Centered feature used by A4. Positive means a better first-row anchor. */
    anchorIndex: number;
}

function straightHighForSequence(sequence: Rank[]): number {
    return sequence.includes(14) && sequence.includes(2) && sequence.includes(3)
        ? 3
        : Math.max(...sequence);
}

/**
 * There are twelve Pure Straight kicker classes (3-high through A-high). Against
 * a uniformly distributed kicker inside that category, a class has half credit
 * for ties and full credit for every lower class.
 */
export function pureStraightKickerEquity(high: number): number {
    return clamp((high - 3 + 0.5) / 12, 0, 1);
}

export function analyzeOpeningRank(rank: Rank): OpeningRankMetrics {
    const routeHighs = PURE_STRAIGHT_SEQUENCES
        .filter(sequence => sequence[0] === rank)
        .map(straightHighForSequence)
        .sort((a, b) => b - a);
    const routeEquitySum = routeHighs.reduce(
        (total, high) => total + pureStraightKickerEquity(high),
        0,
    );
    // Two routes are the flexible baseline. This makes K and 2 genuine edge
    // anchors rather than letting their raw high-card value mask one-way draws.
    const anchorIndex = routeEquitySum - 1 + (routeHighs.length - 2) * 0.3;
    return {
        rank,
        routeCount: routeHighs.length,
        routeHighs,
        bestHigh: Math.max(0, ...routeHighs),
        routeEquitySum,
        anchorIndex,
    };
}

function handCanSupplyRanks(hand: Card[], ranks: Rank[]): boolean {
    const counts = new Map<Rank, number>();
    for (const card of hand) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    for (const rank of ranks) {
        const remaining = counts.get(rank) ?? 0;
        if (remaining === 0) return false;
        counts.set(rank, remaining - 1);
    }
    return true;
}

function cardAssignmentsForRanks(hand: Card[], ranks: Rank[]): string[][] {
    const assignments: string[][] = [];
    const visit = (rankIndex: number, used: Set<string>, cardIds: string[]) => {
        if (rankIndex === ranks.length) {
            assignments.push(cardIds);
            return;
        }
        for (const card of hand) {
            if (card.rank !== ranks[rankIndex] || used.has(card.id)) continue;
            const nextUsed = new Set(used);
            nextUsed.add(card.id);
            visit(rankIndex + 1, nextUsed, [...cardIds, card.id]);
        }
    };
    visit(0, new Set(), []);
    return assignments;
}

function pureStraightPortfolioOptions(player: PlayerState, column: number): PureStraightPortfolioOption[] {
    const cards = player.board
        .map(row => row[column])
        .filter((candidate): candidate is Card => candidate !== null);
    if (cards.length === 0) return [];
    if (cards.length === 3) {
        const result = evaluateYHand(cards, 1);
        if (result.type !== 'PureStraight' && result.type !== 'PureStraightFlush') return [];
        const high = result.kickers[0] ?? 0;
        return [{ cardIds: [], value: player.dice[column] * (1 + pureStraightKickerEquity(high) * 0.6) }];
    }

    const prefix = cards.map(card => card.rank);
    return PURE_STRAIGHT_SEQUENCES
        .filter(sequence => prefix.every((rank, index) => sequence[index] === rank))
        .flatMap(sequence => {
            const suffix = sequence.slice(prefix.length);
            const value = player.dice[column]
                * (1 + pureStraightKickerEquity(straightHighForSequence(sequence)) * 0.6);
            return cardAssignmentsForRanks(player.hand, suffix).map(cardIds => ({ cardIds, value }));
        });
}

/**
 * Solves a five-column weighted set-packing problem over cards currently held.
 * One physical card can secure at most one route, preventing the local policy
 * from promising the same completion card to several columns simultaneously.
 */
export function analyzePureStraightPortfolio(player: PlayerState): PureStraightPortfolio {
    const options = Array.from({ length: 5 }, (_, column) => (
        pureStraightPortfolioOptions(player, column)
    ));
    let bestValue = 0;
    let bestColumns = 0;
    const visit = (column: number, used: Set<string>, value: number, securedColumns: number) => {
        if (column === 5) {
            if (value > bestValue || (value === bestValue && securedColumns > bestColumns)) {
                bestValue = value;
                bestColumns = securedColumns;
            }
            return;
        }
        visit(column + 1, used, value, securedColumns);
        for (const option of options[column]) {
            if (option.cardIds.some(cardId => used.has(cardId))) continue;
            const nextUsed = new Set(used);
            option.cardIds.forEach(cardId => nextUsed.add(cardId));
            visit(column + 1, nextUsed, value + option.value, securedColumns + 1);
        }
    };
    visit(0, new Set(), 0, 0);
    return { value: bestValue, securedColumns: bestColumns };
}

/**
 * Measures the actionable value of a positional three-card straight. A pure
 * straight needs one rank out of four suits after an ordered two-card prefix;
 * a three of a kind needs one of only two remaining cards. Cards already held
 * are treated as secured resources rather than probabilistic outs.
 */
export function analyzePureStraightPlan(columnCards: Card[], hand: Card[]): PureStraightPlan {
    if (columnCards.length >= 3) {
        const result = evaluateYHand(columnCards.slice(0, 3), 1);
        const completed = result.type === 'PureStraight' || result.type === 'PureStraightFlush';
        const bestRouteHigh = completed ? (result.kickers[0] ?? 0) : 0;
        return {
            viableSequences: completed ? 1 : 0,
            bestHeldSuffix: 0,
            completionOuts: 0,
            completionHeld: false,
            secured: completed,
            completed,
            bestRouteHigh,
            bestRouteEquity: pureStraightKickerEquity(bestRouteHigh),
            bestHeldRouteHigh: 0,
            bestSecuredRouteHigh: bestRouteHigh,
            baseValue: completed ? 1 : 0,
            value: completed ? 0.45 + pureStraightKickerEquity(bestRouteHigh) * 0.85 : 0,
        };
    }

    const prefix = columnCards.map(card => card.rank);
    const viable = PURE_STRAIGHT_SEQUENCES.filter(sequence => (
        prefix.every((rank, index) => sequence[index] === rank)
    ));
    if (viable.length === 0) {
        return {
            viableSequences: 0,
            bestHeldSuffix: 0,
            completionOuts: 0,
            completionHeld: false,
            secured: false,
            completed: false,
            bestRouteHigh: 0,
            bestRouteEquity: 0,
            bestHeldRouteHigh: 0,
            bestSecuredRouteHigh: 0,
            baseValue: 0,
            value: 0,
        };
    }

    let bestHeldSuffix = 0;
    let secured = false;
    let bestHeldRouteHigh = 0;
    let bestSecuredRouteHigh = 0;
    for (const sequence of viable) {
        const routeHigh = straightHighForSequence(sequence);
        const suffix = sequence.slice(prefix.length);
        let heldPrefix = 0;
        for (let length = 1; length <= suffix.length; length++) {
            if (handCanSupplyRanks(hand, suffix.slice(0, length))) heldPrefix = length;
            else break;
        }
        bestHeldSuffix = Math.max(bestHeldSuffix, heldPrefix);
        if (heldPrefix > 0) bestHeldRouteHigh = Math.max(bestHeldRouteHigh, routeHigh);
        if (handCanSupplyRanks(hand, suffix)) {
            secured = true;
            bestSecuredRouteHigh = Math.max(bestSecuredRouteHigh, routeHigh);
        }
    }

    const completionHeld = columnCards.length === 2 && bestHeldSuffix === 1;
    const completionOuts = columnCards.length === 2 ? 4 : 0;
    const baseValue = columnCards.length === 2
        ? (completionHeld ? 1.35 : 0.42)
        : secured
            ? 1
            : bestHeldSuffix >= 1
                ? 0.5
                : 0.02 + Math.min(2, viable.length) * 0.01;
    const bestRouteHigh = Math.max(...viable.map(straightHighForSequence));
    const actionableHigh = secured
        ? bestSecuredRouteHigh
        : bestHeldRouteHigh || bestRouteHigh;
    const bestRouteEquity = pureStraightKickerEquity(actionableHigh);
    const value = baseValue * (0.45 + bestRouteEquity * 0.85);

    return {
        viableSequences: viable.length,
        bestHeldSuffix,
        completionOuts,
        completionHeld,
        secured,
        completed: false,
        bestRouteHigh,
        bestRouteEquity,
        bestHeldRouteHigh,
        bestSecuredRouteHigh,
        baseValue,
        value,
    };
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

function yHandUtility(cards: Card[]): number {
    const result = evaluateYHand(cards, 1);
    const kicker = result.kickers.reduce(
        (value, rank, index) => value + rank / (14 * 10 ** index),
        0,
    );
    return result.rankValue + kicker * 0.08;
}

interface CompletionResourceProfile {
    bestCardId: string;
    bestValue: number;
    secondBestValue: number;
}

const completionResourceCache = new WeakMap<PlayerState, Array<CompletionResourceProfile | null>>();
const pureStraightPortfolioCache = new WeakMap<PlayerState, PureStraightPortfolio>();
const pureStraightPortfolioDeltaCache = new WeakMap<PlayerState, Map<string, number>>();

function getPureStraightPortfolio(player: PlayerState): PureStraightPortfolio {
    const cached = pureStraightPortfolioCache.get(player);
    if (cached) return cached;
    const portfolio = analyzePureStraightPortfolio(player);
    pureStraightPortfolioCache.set(player, portfolio);
    return portfolio;
}

export function pureStraightPortfolioDelta(
    player: PlayerState,
    card: Card,
    destinationColumn: number,
): number {
    const row = firstEmptyRow(player, destinationColumn);
    if (row === -1) return Number.NEGATIVE_INFINITY;
    let stateCache = pureStraightPortfolioDeltaCache.get(player);
    if (!stateCache) {
        stateCache = new Map();
        pureStraightPortfolioDeltaCache.set(player, stateCache);
    }
    const key = `${card.id}:${destinationColumn}`;
    const cached = stateCache.get(key);
    if (cached !== undefined) return cached;

    const board = player.board.map(boardRow => [...boardRow]);
    board[row][destinationColumn] = card;
    const projectedPlayer: PlayerState = {
        ...player,
        board,
        hand: player.hand.filter(candidate => candidate.id !== card.id),
    };
    const delta = analyzePureStraightPortfolio(projectedPlayer).value
        - getPureStraightPortfolio(player).value;
    stateCache.set(key, delta);
    return delta;
}

function getCompletionResourceProfiles(player: PlayerState): Array<CompletionResourceProfile | null> {
    const cached = completionResourceCache.get(player);
    if (cached) return cached;
    const profiles = Array.from({ length: 5 }, (_, column) => {
        const columnCards = player.board
            .map(row => row[column])
            .filter((candidate): candidate is Card => candidate !== null);
        if (columnCards.length !== 2 || player.hand.length === 0) return null;
        const ranked = player.hand
            .map(candidate => ({
                cardId: candidate.id,
                value: yHandUtility([...columnCards, candidate]),
            }))
            .sort((left, right) => right.value - left.value);
        return {
            bestCardId: ranked[0].cardId,
            bestValue: ranked[0].value,
            secondBestValue: ranked[1]?.value ?? 0,
        };
    });
    completionResourceCache.set(player, profiles);
    return profiles;
}

/**
 * Exact, local-to-the-information-set shadow price for a card in hand. Only
 * immediate two-card columns are used: their completion value is fully known,
 * cheap to enumerate, and does not assume which unseen cards will be drawn.
 */
export function completionResourceOpportunityCost(
    player: PlayerState,
    card: Card,
    destinationColumn: number,
): number {
    let weightedLoss = 0;
    const profiles = getCompletionResourceProfiles(player);
    for (let column = 0; column < 5; column++) {
        if (column === destinationColumn) continue;
        const profile = profiles[column];
        if (!profile || profile.bestCardId !== card.id) continue;
        weightedLoss += Math.max(0, profile.bestValue - profile.secondBestValue)
            * player.dice[column] / 6;
    }
    return weightedLoss;
}

export function getGtoTurnOrderScore(player: PlayerState, weights = XY_GTO_A7): number {
    const ranks = player.hand.map(card => card.rank);
    const duplicateCards = ranks.length - new Set(ranks).size;
    const highCards = ranks.filter(rank => rank >= 11).length;
    const disposableCards = ranks.filter(rank => rank <= 7).length / Math.max(1, ranks.length);
    const metrics = analyzeDiceBoard(player.dice);
    const adaptation = effectiveBoardAdaptation(weights);
    const polarizedFirstMoverValue = adaptation
        * metrics.bonusRaceIndex
        * (0.95 + disposableCards * 0.35);
    const bestOpeningAnchor = Math.max(
        ...player.hand.map(card => analyzeOpeningRank(card.rank).anchorIndex),
        0,
    );
    const openingInitiative = (weights.openingAnchorEfficiency ?? 0) * bestOpeningAnchor * 0.22;
    return weights.firstBias + duplicateCards * 0.7 + highCards * 0.16
        + polarizedFirstMoverValue + openingInitiative - 0.45;
}

export function scoreGtoMove(
    state: GameState,
    playerIndex: 0 | 1,
    card: Card,
    column: number,
    weights = XY_GTO_A7,
): number {
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];
    const row = firstEmptyRow(player, column);
    if (row === -1) return Number.NEGATIVE_INFINITY;

    const ownColumn = player.board
        .map(boardRow => boardRow[column])
        .filter((value): value is Card => value !== null);
    const projectedColumn = [...ownColumn, card];
    const remainingHand = player.hand.filter(candidate => candidate.id !== card.id);
    const dice = player.dice[column];
    const metrics = analyzeDiceBoard(player.dice);
    const adaptation = effectiveBoardAdaptation(weights);
    const rangeScale = Math.max(1, metrics.range);
    const relativeCheapness = clamp((metrics.mean - dice) / rangeScale, 0, 1);
    const relativeStake = clamp((dice - metrics.mean) / rangeScale, -1, 1);
    const rushPotential = adaptation * metrics.bonusRaceIndex * relativeCheapness;
    const diceScale = 0.45 + (dice / 6) * weights.diceWeight;
    const yValue = partialYValue(projectedColumn) * diceScale * weights.yWeight * 8;
    const pureStraightPlan = analyzePureStraightPlan(projectedColumn, remainingHand);
    const kickerEfficiency = clamp(weights.pureStraightKickerEfficiency ?? 0, 0, 2);
    const strengthAwarePureStraightValue = pureStraightPlan.baseValue
        + (pureStraightPlan.value - pureStraightPlan.baseValue) * kickerEfficiency;
    const pureStraightValue = strengthAwarePureStraightValue
        * (weights.pureStraightEfficiency ?? 0)
        * weights.yWeight
        * (1.4 + dice / 6 * 3);
    const openingMetrics = analyzeOpeningRank(card.rank);
    const openingAnchorValue = row === 0
        ? openingMetrics.anchorIndex
            * (weights.openingAnchorEfficiency ?? 0)
            * (3 + dice / 2)
        : 0;
    const openTopSlots = player.board[0].filter(value => value === null).length;
    const queensAlreadyInColumn = ownColumn.filter(value => value.rank === 12).length;
    const pureRouteUse = pureStraightPlan.viableSequences > 0;
    const queenOpportunityCost = card.rank === 12 && row > 0 && openTopSlots > 0
        ? (weights.queenConservation ?? 0)
            * (openTopSlots / 5)
            * (1 + queensAlreadyInColumn * 0.7)
            * (pureRouteUse ? 1.1 : 4)
        : 0;
    const conservationWeight = weights.completionResourceConservation ?? 0;
    const completionOpportunityCost = (conservationWeight === 0
        ? 0
        : completionResourceOpportunityCost(player, card, column) * conservationWeight)
        // On polarized boards, finishing the cheap column for a bonus draw can
        // dominate preserving a known completion elsewhere (e.g. 66611).
        * (1 - rushPotential * 0.85);
    const portfolioWeight = weights.pureStraightPortfolioEfficiency ?? 0;
    const pureStraightPortfolioValue = portfolioWeight === 0
        ? 0
        : pureStraightPortfolioDelta(player, card, column) * portfolioWeight;

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
    const rushTempoFloor = Math.max(0, XY_GTO_A2.tempoWeight - weights.tempoWeight);
    const tempoValue = row === 2 && !opponentComplete
        ? 4.5 * weights.tempoWeight
            + rushPotential * (5.5 + opponentProgress * 0.45 + rushTempoFloor * 4.5)
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
        ? opponentVisible.length * partialYValue(opponentVisible) * dice * 0.22
            * weights.flexibilityWeight * (weights.opponentResponseScale ?? 1)
        : 0;

    return yValue + pureStraightValue + openingAnchorValue + xValue + tempoValue + progressValue
        + rushPlanValue + flexibilityValue + pureStraightPortfolioValue
        + showdownValue + responseValue + resourceAlignmentValue
        - row3Penalty - lowDiceHighCardCost - queenOpportunityCost - completionOpportunityCost;
}

export function getGtoHideProbability(
    state: GameState,
    playerIndex: 0 | 1,
    card: Card,
    column: number,
    weights = XY_GTO_A7,
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
