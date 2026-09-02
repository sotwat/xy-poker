import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateEloChange,
    calculateUpdatedAiParams,
    createGameRecordTrainingMetadata,
    createDeck,
    generateRoomId,
    generateSessionToken,
    isValidBrowserId,
    isValidGameAction,
    isValidGameRecord,
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

test('validates complete compact game records', () => {
    const deck = createDeck();
    const record = {
        schemaVersion: 1,
        id: '00000000-0000-4000-8000-000000000001',
        startedAt: '2026-09-01T00:00:00.000Z',
        completedAt: '2026-09-01T00:10:00.000Z',
        mode: 'ranked',
        viewerPlayerIndex: 0,
        playerNames: ['Alice', 'Bob'],
        dice: [6, 5, 4, 3, 2],
        winner: 'p1',
        scores: [12, 8],
        bonuses: [2, 1],
        moves: Array.from({ length: 30 }, (_, index) => ({
            ply: index + 1,
            playerIndex: index % 2,
            card: { ...deck[index], isHidden: false },
            column: Math.floor(index / 6),
            row: Math.floor((index % 6) / 2),
        })),
    };

    assert.equal(isValidGameRecord(record), true);
    assert.equal(isValidGameRecord({ ...record, moves: record.moves.slice(0, 29) }), false);
    assert.equal(isValidGameRecord({ ...record, viewerPlayerIndex: 2 }), false);
});

test('validates hand-aware version 2 game records', () => {
    const deck = createDeck();
    const initialHands = [deck.slice(0, 4), deck.slice(4, 8)];
    const hands = initialHands.map(hand => hand.map(card => ({ ...card })));
    const moveCounts = [0, 0];
    let drawIndex = 8;
    const moves = Array.from({ length: 30 }, (_, index) => {
        const playerIndex = index % 2;
        const playerMove = moveCounts[playerIndex];
        moveCounts[playerIndex] += 1;
        const card = hands[playerIndex].shift();
        const drawnCards = drawIndex < deck.length ? [{ ...deck[drawIndex] }] : [];
        drawIndex += drawnCards.length;
        hands[playerIndex].push(...drawnCards);
        return {
            ply: index + 1,
            playerIndex,
            card: { ...card, isHidden: false },
            column: Math.floor(playerMove / 3),
            row: playerMove % 3,
            drawnCards,
        };
    });
    const record = {
        schemaVersion: 2,
        id: '00000000-0000-4000-8000-000000000002',
        startedAt: '2026-09-01T00:00:00.000Z',
        completedAt: '2026-09-01T00:10:00.000Z',
        mode: 'ranked',
        viewerPlayerIndex: 0,
        playerNames: ['Alice', 'Bob'],
        dice: [6, 5, 4, 3, 2],
        winner: 'p1',
        scores: [12, 8],
        bonuses: [2, 1],
        initialHands,
        moves,
    };

    assert.equal(isValidGameRecord(record), true);
    assert.ok(JSON.stringify(record).length < 25_000);

    const cardNotInHand = structuredClone(record);
    cardNotInHand.moves[0].card = { ...deck.at(-1), isHidden: false };
    assert.equal(isValidGameRecord(cardNotInHand), false);

    const duplicatedDraw = structuredClone(record);
    duplicatedDraw.moves[0].drawnCards = [{ ...initialHands[1][0] }];
    assert.equal(isValidGameRecord(duplicatedDraw), false);

    const proRecord = structuredClone(record);
    proRecord.schemaVersion = 3;
    proRecord.mode = 'bot';
    proRecord.moves[0].thought = '出目6を守りつつ、Qのストレート2経路を残す。';
    assert.equal(isValidGameRecord(proRecord), true);

    const onlineThought = structuredClone(proRecord);
    onlineThought.mode = 'ranked';
    assert.equal(isValidGameRecord(onlineThought), false);

    const opponentThought = structuredClone(proRecord);
    opponentThought.moves[1].thought = '相手の思考を偽装';
    assert.equal(isValidGameRecord(opponentThought), false);

    const oversizedThought = structuredClone(proRecord);
    oversizedThought.moves[0].thought = '戦'.repeat(281);
    assert.equal(isValidGameRecord(oversizedThought), false);

    const legacyThought = structuredClone(record);
    legacyThought.moves[0].thought = 'v2では許可しない';
    assert.equal(isValidGameRecord(legacyThought), false);
});

test('calculates symmetric Elo changes', () => {
    assert.equal(calculateEloChange(1500, 1500, 1), 16);
    assert.equal(calculateEloChange(1500, 1500, 0), -16);
    assert.equal(calculateEloChange(1500, 1500, 0.5), 0);
});

test('marks records for gameplay-based assessment without using player ratings', () => {
    const metadata = createGameRecordTrainingMetadata({
        aiPolicyId: 'xy-gto-a7',
        aiThinkTimeMs: 1000,
    });

    assert.deepEqual(metadata, {
        schemaVersion: 2,
        source: 'server',
        assessmentBasis: 'gameplay',
        aiPolicyId: 'xy-gto-a7',
        aiThinkTimeMs: 1000,
    });
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
