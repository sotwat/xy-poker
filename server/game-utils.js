import crypto from 'node:crypto';

export const ROOM_ID_PATTERN = /^[A-HJ-NP-Z2-9]{4}$/;
export const BROWSER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const ALLOWED_ACTIONS = new Set(['CHOOSE_TURN_ORDER', 'PLACE_AND_DRAW']);

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

export function isValidGameRecord(record) {
    if (!record || typeof record !== 'object' || ![1, 2].includes(record.schemaVersion)) return false;
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

    const occupiedSlots = new Set();
    const usedCards = new Set();
    const playerMoveCounts = [0, 0];
    let replayHands = null;
    const introducedCards = new Set();

    if (record.schemaVersion === 2) {
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

        if (record.schemaVersion === 2) {
            const cardIndex = replayHands[move.playerIndex].findIndex(card => card.id === move.card.id);
            if (cardIndex < 0 || !Array.isArray(move.drawnCards) || move.drawnCards.length > 2) return false;
            replayHands[move.playerIndex].splice(cardIndex, 1);
            for (const drawnCard of move.drawnCards) {
                if (!isValidRecordCard(drawnCard) || introducedCards.has(drawnCard.id)) return false;
                introducedCards.add(drawnCard.id);
                replayHands[move.playerIndex].push({ ...drawnCard });
            }
        }
    }

    return playerMoveCounts[0] === 15 && playerMoveCounts[1] === 15;
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
