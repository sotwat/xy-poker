import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateEloChange,
    calculateUpdatedAiParams,
    createDeck,
    generateRoomId,
    generateSessionToken,
    isValidBrowserId,
    isValidGameAction,
    normalizeRoomId,
    randomPlayerIndex,
    sanitizePlayerName,
    shuffleDeck,
} from './game-utils.js';

test('creates and shuffles a complete deck without changing its cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    assert.equal(deck.length, 52);
    assert.equal(new Set(deck.map(card => card.id)).size, 52);
    assert.deepEqual([...shuffled].map(card => card.id).sort(), [...deck].map(card => card.id).sort());
});

test('returns only valid player indexes', () => {
    for (let index = 0; index < 100; index += 1) {
        assert.ok([0, 1].includes(randomPlayerIndex()));
    }
});

test('generates unguessable local-game session tokens', () => {
    const first = generateSessionToken();
    const second = generateSessionToken();
    assert.match(first, /^[A-Za-z0-9_-]{32}$/);
    assert.notEqual(first, second);
});

test('normalizes safe room and player input', () => {
    assert.match(generateRoomId(), /^[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(normalizeRoomId(' ab2c '), 'AB2C');
    assert.equal(normalizeRoomId('O0I1'), null);
    assert.equal(sanitizePlayerName('  Alice\u0000  '), 'Alice');
    assert.equal(sanitizePlayerName('abcdefghijklmnop'), 'abcdefghijklmno');
});

test('validates browser IDs and relayed game actions', () => {
    assert.equal(isValidBrowserId('550e8400-e29b-41d4-a716-446655440000'), true);
    assert.equal(isValidBrowserId('not-an-id'), false);
    assert.equal(isValidGameAction({ type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 1 } }), true);
    assert.equal(isValidGameAction({ type: 'PLACE_AND_DRAW', payload: { cardId: 'hearts-10', colIndex: 4, isHidden: false } }), true);
    assert.equal(isValidGameAction({ type: 'PLACE_AND_DRAW', payload: { cardId: 'x', colIndex: 9, isHidden: false } }), false);
    assert.equal(isValidGameAction({ type: 'SYNC_STATE', payload: {} }), false);
});

test('calculates symmetric Elo changes', () => {
    assert.equal(calculateEloChange(1500, 1500, 1), 16);
    assert.equal(calculateEloChange(1500, 1500, 0), -16);
    assert.equal(calculateEloChange(1500, 1500, 0.5), 0);
});

test('updates AI parameters from safe defaults and clamps them', () => {
    const won = calculateUpdatedAiParams({ total_games: 4, ai_wins: 2, hiding_strategy: 100 }, true, false);
    assert.equal(won.total_games, 5);
    assert.equal(won.ai_wins, 3);
    assert.equal(won.hiding_strategy, 0.6);
    assert.ok(Number.isFinite(won.trip_preference));

    const draw = calculateUpdatedAiParams({ total_games: 1, ai_wins: 1 }, false, true);
    assert.equal(draw.total_games, 2);
    assert.equal(draw.ai_wins, 1);
    assert.equal(draw.trip_preference, 1);
});
