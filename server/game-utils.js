import crypto from 'node:crypto';

export const ROOM_ID_PATTERN = /^[A-HJ-NP-Z2-9]{4}$/;
export const BROWSER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const ALLOWED_ACTIONS = new Set(['CHOOSE_TURN_ORDER', 'PLACE_AND_DRAW']);
export const MAX_GAME_RECORD_THOUGHT_LENGTH = 280;
export const GAME_RECORD_TRAINING_METADATA_VERSION = 2;

const Y_HAND_ACHIEVEMENTS = Object.freeze({
    PureStraightFlush: 'y_win_pure_straight_flush',
    ThreeOfAKind: 'y_win_three_of_a_kind',
    StraightFlush: 'y_win_straight_flush',
    PureStraight: 'y_win_pure_straight',
    Flush: 'y_win_flush',
    PureOnePair: 'y_win_pure_one_pair',
    Straight: 'y_win_straight',
    OnePair: 'y_win_one_pair',
    HighCard: 'y_win_high_card',
});

const X_HAND_ACHIEVEMENTS = Object.freeze({
    RoyalFlush: 'x_win_royal_flush',
    StraightFlush: 'straight_flush_x',
    FourOfAKind: 'x_win_four_of_a_kind',
    FullHouse: 'x_win_full_house',
    Straight: 'x_win_straight',
    Flush: 'x_win_flush',
    ThreeOfAKind: 'x_win_three_of_a_kind',
    TwoPair: 'x_win_two_pair',
    OnePair: 'x_win_one_pair',
    HighCard: 'x_win_high_card',
});

export const ROLE_WIN_ACHIEVEMENT_TYPES = Object.freeze([
    ...Object.values(X_HAND_ACHIEVEMENTS),
    ...Object.values(Y_HAND_ACHIEVEMENTS),
]);

export function createGameRecordTrainingMetadata(options = {}) {
    return {
        schemaVersion: GAME_RECORD_TRAINING_METADATA_VERSION,
        source: 'server',
        assessmentBasis: 'gameplay',
        aiPolicyId: options.aiPolicyId ?? null,
        aiThinkTimeMs: Number.isInteger(options.aiThinkTimeMs) ? options.aiThinkTimeMs : null,
    };
}

export function calculateEloChange(playerRating, opponentRating, actualScore, kFactor = 32) {
    const expectedScore = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
    return Math.round(kFactor * (actualScore - expectedScore));
}

export function createDeck() {
    return SUITS.flatMap(suit => RANKS.map(rank => ({
        suit,
        rank,
        id: `${suit}-${rank}`,
    })));
}

export function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const target = crypto.randomInt(index + 1);
        [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    return shuffled;
}

export function rollDice() {
    return Array.from({ length: 5 }, () => crypto.randomInt(1, 7)).sort((a, b) => b - a);
}

export function randomPlayerIndex() {
    return crypto.randomInt(2);
}

export function selectShowdownVoiceAssignment(randomIndex = maximum => crypto.randomInt(maximum)) {
    const available = ['mana', 'tsukuyomi', 'kurowa'];
    const p1 = available.splice(randomIndex(available.length), 1)[0];
    const p2 = available[randomIndex(available.length)];
    return { p1, p2 };
}

export function generateSessionToken() {
    return crypto.randomBytes(24).toString('base64url');
}

export function generateRoomId() {
    return Array.from({ length: 4 }, () => ROOM_ID_CHARS[crypto.randomInt(ROOM_ID_CHARS.length)]).join('');
}

export function sanitizePlayerName(value) {
    if (typeof value !== 'string') return 'Player';
    const sanitized = value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 15);
    return sanitized || 'Player';
}

export function normalizeRoomId(value) {
    if (typeof value !== 'string') return null;
    const roomId = value.trim().toUpperCase();
    return ROOM_ID_PATTERN.test(roomId) ? roomId : null;
}

export function isValidBrowserId(value) {
    return typeof value === 'string' && BROWSER_ID_PATTERN.test(value);
}

export function isValidGameAction(action) {
    if (!action || typeof action !== 'object' || !ALLOWED_ACTIONS.has(action.type)) return false;
    if (!action.payload || typeof action.payload !== 'object') return false;

    if (action.type === 'CHOOSE_TURN_ORDER') {
        return action.payload.startingPlayer === 0 || action.payload.startingPlayer === 1;
    }

    return typeof action.payload.cardId === 'string'
        && action.payload.cardId.length <= 40
        && Number.isInteger(action.payload.colIndex)
        && action.payload.colIndex >= 0
        && action.payload.colIndex < 5
        && typeof action.payload.isHidden === 'boolean';
}

function isValidRecordCard(card, requireHidden = false) {
    if (!card || typeof card !== 'object') return false;
    const validHidden = requireHidden
        ? typeof card.isHidden === 'boolean'
        : card.isHidden === undefined || card.isHidden === false;
    return typeof card.id === 'string'
        && card.id === `${card.suit}-${card.rank}`
        && SUITS.includes(card.suit)
        && RANKS.includes(card.rank)
        && validHidden;
}

function normalizeRecordThought(value) {
    return value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim())
        .join('\n')
        .trim()
        .slice(0, MAX_GAME_RECORD_THOUGHT_LENGTH);
}

export function isValidGameRecord(record) {
    if (!record || typeof record !== 'object' || ![1, 2, 3].includes(record.schemaVersion)) return false;
    if (typeof record.id !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.id)) return false;
    const startedAt = Date.parse(record.startedAt);
    const completedAt = Date.parse(record.completedAt);
    if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) return false;
    if (!['bot', 'ranked', 'private'].includes(record.mode)) return false;
    if (record.viewerPlayerIndex !== 0 && record.viewerPlayerIndex !== 1) return false;
    if (!Array.isArray(record.playerNames) || record.playerNames.length !== 2
        || !record.playerNames.every(name => typeof name === 'string' && name.trim().length > 0 && name.length <= 15)) return false;
    if (!Array.isArray(record.dice) || record.dice.length !== 5
        || !record.dice.every(die => Number.isInteger(die) && die >= 1 && die <= 6)) return false;
    if (!['p1', 'p2', 'draw'].includes(record.winner)) return false;
    if (!Array.isArray(record.scores) || record.scores.length !== 2
        || !record.scores.every(score => Number.isInteger(score) && score >= 0 && score <= 200)) return false;
    if (!Array.isArray(record.bonuses) || record.bonuses.length !== 2
        || !record.bonuses.every(bonus => Number.isInteger(bonus) && bonus >= 0 && bonus <= 5)) return false;
    if (!Array.isArray(record.moves) || record.moves.length !== 30) return false;
    if (JSON.stringify(record).length > 25_000) return false;
    if (record.schemaVersion === 3
        && record.mode !== 'bot'
        && record.moves.some(move => move && typeof move === 'object' && 'thought' in move)) return false;

    const occupiedSlots = new Set();
    const usedCards = new Set();
    const playerMoveCounts = [0, 0];
    let replayHands = null;
    const introducedCards = new Set();

    if (record.schemaVersion !== 1) {
        if (!Array.isArray(record.initialHands) || record.initialHands.length !== 2
            || !record.initialHands.every(hand => Array.isArray(hand)
                && hand.length === 4
                && hand.every(card => isValidRecordCard(card)))) return false;
        replayHands = record.initialHands.map(hand => hand.map(card => ({ ...card })));
        for (const card of replayHands.flat()) {
            if (introducedCards.has(card.id)) return false;
            introducedCards.add(card.id);
        }
    }

    for (let index = 0; index < record.moves.length; index += 1) {
        const move = record.moves[index];
        if (!move || typeof move !== 'object' || move.ply !== index + 1) return false;
        if (move.playerIndex !== 0 && move.playerIndex !== 1) return false;
        if (!Number.isInteger(move.column) || move.column < 0 || move.column >= 5) return false;
        if (!Number.isInteger(move.row) || move.row < 0 || move.row >= 3) return false;
        if (!isValidRecordCard(move.card, true)) return false;

        const slotKey = `${move.playerIndex}-${move.row}-${move.column}`;
        if (occupiedSlots.has(slotKey) || usedCards.has(move.card.id)) return false;
        occupiedSlots.add(slotKey);
        usedCards.add(move.card.id);
        playerMoveCounts[move.playerIndex] += 1;

        if (record.schemaVersion !== 1) {
            const cardIndex = replayHands[move.playerIndex].findIndex(card => card.id === move.card.id);
            if (cardIndex < 0 || !Array.isArray(move.drawnCards) || move.drawnCards.length > 2) return false;
            replayHands[move.playerIndex].splice(cardIndex, 1);
            for (const drawnCard of move.drawnCards) {
                if (!isValidRecordCard(drawnCard) || introducedCards.has(drawnCard.id)) return false;
                introducedCards.add(drawnCard.id);
                replayHands[move.playerIndex].push({ ...drawnCard });
            }
        }

        const thought = 'thought' in move ? move.thought : undefined;
        if (record.schemaVersion < 3 && thought !== undefined) return false;
        if (record.schemaVersion === 3 && thought !== undefined) {
            if (move.playerIndex !== record.viewerPlayerIndex
                || typeof thought !== 'string'
                || thought !== normalizeRecordThought(thought)
                || thought.length < 1
                || thought.length > MAX_GAME_RECORD_THOUGHT_LENGTH) return false;
        }
    }

    return playerMoveCounts[0] === 15 && playerMoveCounts[1] === 15;
}

function compareKickers(first, second) {
    for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
        const difference = (first[index] || 0) - (second[index] || 0);
        if (difference !== 0) return Math.sign(difference);
    }
    return 0;
}

function isOrderedThreeCardStraight(cards) {
    const ranks = cards.map(card => card.rank);
    return (ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2])
        || (ranks[0] - 1 === ranks[1] && ranks[1] - 1 === ranks[2])
        || (ranks[0] === 14 && ranks[1] === 2 && ranks[2] === 3)
        || (ranks[0] === 3 && ranks[1] === 2 && ranks[2] === 14);
}

/** Mirrors the client Y-hand evaluator so achievement wins match the result table. */
export function evaluateYHandForAchievement(cards) {
    const ranks = cards.map(card => card.rank).sort((a, b) => a - b);
    const isFlush = cards.every(card => card.suit === cards[0].suit);
    const isStraight = (ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2])
        || (ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 14);
    const straightHigh = ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 14 ? 3 : ranks[2];
    const isTrips = ranks[0] === ranks[1] && ranks[1] === ranks[2];
    const isPair = !isTrips && (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]);
    const isLowerPair = ranks[0] === ranks[1];
    const orderedStraight = isStraight && isOrderedThreeCardStraight(cards);
    const sortedRanks = [...ranks].sort((a, b) => b - a);

    if (isFlush && orderedStraight) return { type: 'PureStraightFlush', rankValue: 9, kickers: [straightHigh] };
    if (isTrips) return { type: 'ThreeOfAKind', rankValue: 8, kickers: [ranks[0]] };
    if (isFlush && isStraight) return { type: 'StraightFlush', rankValue: 7, kickers: [straightHigh] };
    if (!isFlush && orderedStraight) return { type: 'PureStraight', rankValue: 6, kickers: [straightHigh] };
    if (isFlush) return { type: 'Flush', rankValue: 5, kickers: sortedRanks };

    if (isPair) {
        const positionalRanks = cards.map(card => card.rank);
        const adjacentPair = positionalRanks[0] === positionalRanks[1]
            || positionalRanks[1] === positionalRanks[2];
        if (adjacentPair) {
            const pairRank = isLowerPair ? ranks[0] : ranks[1];
            const kicker = isLowerPair ? ranks[2] : ranks[0];
            return { type: 'PureOnePair', rankValue: 4, kickers: [pairRank, kicker] };
        }
    }

    if (isStraight) return { type: 'Straight', rankValue: 3, kickers: [straightHigh] };
    if (isPair) return { type: 'OnePair', rankValue: 2, kickers: [ranks[0], ranks[1]] };
    return { type: 'HighCard', rankValue: 1, kickers: sortedRanks };
}

const X_HAND_BASE_SCORES = Object.freeze({
    RoyalFlush: 1000,
    StraightFlush: 16,
    FourOfAKind: 14,
    FullHouse: 12,
    Straight: 10,
    Flush: 8,
    ThreeOfAKind: 6,
    TwoPair: 4,
    OnePair: 2,
    HighCard: 0,
});

/** Mirrors the client X-hand evaluator and its game-specific scoring order. */
export function evaluateXHandForAchievement(cards) {
    const ranks = cards.map(card => card.rank).sort((a, b) => a - b);
    const isFlush = cards.every(card => card.suit === cards[0].suit);
    const isWheel = ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 4 && ranks[3] === 5 && ranks[4] === 14;
    const isStraight = isWheel || ranks.every((rank, index) => index === 0 || ranks[index - 1] + 1 === rank);
    const counts = new Map();
    for (const rank of ranks) counts.set(rank, (counts.get(rank) || 0) + 1);
    const countValues = [...counts.values()].sort((a, b) => b - a);

    let type;
    let kickers;
    if (isFlush && isStraight && ranks[0] === 10 && ranks[4] === 14) {
        type = 'RoyalFlush'; kickers = [];
    } else if (isFlush && isStraight) {
        type = 'StraightFlush'; kickers = [ranks[4]];
    } else if (countValues[0] === 4) {
        const fourRank = [...counts].find(([, count]) => count === 4)[0];
        const kicker = [...counts].find(([, count]) => count === 1)[0];
        type = 'FourOfAKind'; kickers = [fourRank, kicker];
    } else if (countValues[0] === 3 && countValues[1] === 2) {
        const threeRank = [...counts].find(([, count]) => count === 3)[0];
        const pairRank = [...counts].find(([, count]) => count === 2)[0];
        type = 'FullHouse'; kickers = [threeRank, pairRank];
    } else if (isFlush) {
        type = 'Flush'; kickers = [...ranks].reverse();
    } else if (isStraight) {
        type = 'Straight'; kickers = [isWheel ? 5 : ranks[4]];
    } else if (countValues[0] === 3) {
        const threeRank = [...counts].find(([, count]) => count === 3)[0];
        type = 'ThreeOfAKind'; kickers = [threeRank, ...ranks.filter(rank => rank !== threeRank).reverse()];
    } else if (countValues[0] === 2 && countValues[1] === 2) {
        const pairs = [...counts].filter(([, count]) => count === 2).map(([rank]) => rank).sort((a, b) => b - a);
        const kicker = [...counts].find(([, count]) => count === 1)[0];
        type = 'TwoPair'; kickers = [...pairs, kicker];
    } else if (countValues[0] === 2) {
        const pairRank = [...counts].find(([, count]) => count === 2)[0];
        type = 'OnePair'; kickers = [pairRank, ...ranks.filter(rank => rank !== pairRank).reverse()];
    } else {
        type = 'HighCard'; kickers = [...ranks].reverse();
    }

    return { type, baseScore: X_HAND_BASE_SCORES[type], kickers };
}

function analyzeWonHands(record) {
    const boards = [0, 1].map(() => Array.from({ length: 3 }, () => Array(5).fill(null)));
    for (const move of record.moves) boards[move.playerIndex][move.row][move.column] = move.card;

    const playerIndex = record.viewerPlayerIndex;
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const achievements = new Set();
    let wonYHands = 0;

    for (let column = 0; column < 5; column += 1) {
        const playerCards = boards[playerIndex].map(row => row[column]);
        const opponentCards = boards[opponentIndex].map(row => row[column]);
        if (playerCards.some(card => !card) || opponentCards.some(card => !card)) continue;
        const playerHand = evaluateYHandForAchievement(playerCards);
        const opponentHand = evaluateYHandForAchievement(opponentCards);
        const rankDifference = playerHand.rankValue - opponentHand.rankValue;
        const comparison = rankDifference === 0 ? compareKickers(playerHand.kickers, opponentHand.kickers) : Math.sign(rankDifference);
        if (comparison > 0) {
            wonYHands += 1;
            achievements.add(Y_HAND_ACHIEVEMENTS[playerHand.type]);
        }
    }

    const playerX = evaluateXHandForAchievement(boards[playerIndex][2]);
    const opponentX = evaluateXHandForAchievement(boards[opponentIndex][2]);
    const scoreDifference = playerX.baseScore - opponentX.baseScore;
    const xComparison = scoreDifference === 0 && playerX.type === opponentX.type
        ? compareKickers(playerX.kickers, opponentX.kickers)
        : Math.sign(scoreDifference);
    const wonXHand = xComparison > 0;
    if (wonXHand) achievements.add(X_HAND_ACHIEVEMENTS[playerX.type]);

    return { achievements, boards, wonXHand, wonYHands };
}

export function getWonHandAchievementTypes(record) {
    return [...analyzeWonHands(record).achievements];
}

export function getGameRecordAchievementTypes(record) {
    const { achievements, boards, wonXHand, wonYHands } = analyzeWonHands(record);
    const playerIndex = record.viewerPlayerIndex;
    const viewerWinner = `p${playerIndex + 1}`;
    const wonGame = record.winner === viewerWinner;
    const viewerScore = record.scores[playerIndex];
    const opponentScore = record.scores[playerIndex === 0 ? 1 : 0];
    const viewerBonuses = record.bonuses[playerIndex];

    if (record.winner === 'draw') achievements.add('first_draw');
    if (viewerScore >= 30) achievements.add('score_30');
    if (viewerBonuses >= 3) achievements.add('bonus_3');
    if (viewerBonuses >= 5) achievements.add('bonus_5');

    if (wonGame) {
        if (Math.abs(viewerScore - opponentScore) === 1) achievements.add('close_win');
        if (viewerBonuses === 0) achievements.add('no_bonus_win');
        if (boards[playerIndex].flat().filter(card => card?.isHidden).length === 3) {
            achievements.add('hidden_three_win');
        }
        if (wonYHands === 5) achievements.add('y_sweep');
        if (wonYHands === 5 && wonXHand) achievements.add('perfect_game');
    }

    return [...achievements];
}

const AI_PARAMETER_DEFAULTS = {
    trip_preference: 1,
    flush_preference: 1,
    straight_preference: 1,
    x_hand_focus: 1,
    bonus_aggression: 1,
    defensive_awareness: 0.8,
    pure_preference: 1,
    trips_in_hand_focus: 1,
    row3_delay_focus: 1,
    showdown_delay_focus: 1,
    low_card_avoidance: 1,
    turn_order_flexibility: 1,
    weak_hand_avoidance: 1,
    pair_in_hand_scale: 1,
    queen_first_scale: 1,
    bluff_bonus_scale: 1,
    hiding_strategy: 0.3,
    trash_bin_rush_scale: 1,
};

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}

export function calculateUpdatedAiParams(current, aiWon, isDraw = false) {
    const updated = Object.fromEntries(Object.entries(AI_PARAMETER_DEFAULTS).map(([key, fallback]) => {
        const value = Number(current?.[key]);
        return [key, Number.isFinite(value) ? value : fallback];
    }));

    if (aiWon && !isDraw) {
        for (const key of ['trip_preference', 'flush_preference', 'straight_preference', 'bonus_aggression']) {
            updated[key] *= 1.015;
        }
        for (const key of ['pure_preference', 'trips_in_hand_focus', 'row3_delay_focus', 'showdown_delay_focus', 'low_card_avoidance', 'turn_order_flexibility']) {
            updated[key] *= 1.012;
        }
        updated.weak_hand_avoidance *= 0.988;
        updated.pair_in_hand_scale *= 1.012;
        updated.queen_first_scale *= 1.012;
        updated.bluff_bonus_scale *= 1.012;
        updated.hiding_strategy *= 1.01;
        updated.trash_bin_rush_scale *= 1.015;
    } else if (!isDraw) {
        const candidates = [
            'trip_preference', 'flush_preference', 'straight_preference', 'bonus_aggression',
            'pure_preference', 'trips_in_hand_focus', 'row3_delay_focus',
            'showdown_delay_focus', 'low_card_avoidance', 'turn_order_flexibility',
        ].sort((left, right) => updated[left] - updated[right]);
        updated[candidates[0]] *= 1.04;
        updated[candidates.at(-1)] *= 0.985;
        updated.defensive_awareness *= 1.02;
        updated.low_card_avoidance *= 1.02;
        updated.weak_hand_avoidance *= 1.025;
        updated.pair_in_hand_scale *= 0.99;
        updated.queen_first_scale *= 0.99;
        updated.bluff_bonus_scale *= 1.015;
        updated.hiding_strategy *= 0.99;
        updated.trash_bin_rush_scale *= 0.99;
    }

    const ranges = {
        trip_preference: [0.4, 2], flush_preference: [0.4, 2], straight_preference: [0.4, 2],
        x_hand_focus: [0.4, 2], bonus_aggression: [0.4, 2.5], defensive_awareness: [0.4, 1.5],
        pure_preference: [0.3, 2], trips_in_hand_focus: [0.4, 2], row3_delay_focus: [0.4, 2],
        showdown_delay_focus: [0.4, 2], low_card_avoidance: [0.4, 2], turn_order_flexibility: [0.4, 2],
        weak_hand_avoidance: [0.5, 3], pair_in_hand_scale: [0.3, 2.5], queen_first_scale: [0.3, 2.5],
        bluff_bonus_scale: [0.5, 3], hiding_strategy: [0.1, 0.6], trash_bin_rush_scale: [0.3, 3],
    };
    for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
        updated[key] = clamp(updated[key], minimum, maximum);
    }

    return {
        ...updated,
        total_games: Math.max(0, Number(current?.total_games) || 0) + 1,
        ai_wins: Math.max(0, Number(current?.ai_wins) || 0) + (aiWon && !isDraw ? 1 : 0),
        updated_at: new Date().toISOString(),
    };
}
