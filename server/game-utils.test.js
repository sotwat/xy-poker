import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateEloChange,
    calculateUpdatedAiParams,
    createGameRecordTrainingMetadata,
    createDeck,
    generateRoomId,
    generateSessionToken,
    getWonHandAchievementTypes,
    isValidBrowserId,
    isValidGameAction,
    isValidGameRecord,
    evaluateXHandForAchievement,
    evaluateYHandForAchievement,
    normalizeRoomId,
    randomPlayerIndex,
    ROLE_WIN_ACHIEVEMENT_TYPES,
    sanitizePlayerName,
    selectShowdownVoiceAssignment,
    shuffleDeck,
} from './game-utils.js';

const testCard = (rank, suit) => ({ rank, suit, id: `${suit}-${rank}` });

test('recognizes every X and Y hand used by win achievements', () => {
    const yHands = [
        [[testCard(2, 'hearts'), testCard(3, 'hearts'), testCard(4, 'hearts')], 'PureStraightFlush'],
        [[testCard(7, 'hearts'), testCard(7, 'clubs'), testCard(7, 'diamonds')], 'ThreeOfAKind'],
        [[testCard(2, 'hearts'), testCard(4, 'hearts'), testCard(3, 'hearts')], 'StraightFlush'],
        [[testCard(2, 'hearts'), testCard(3, 'clubs'), testCard(4, 'diamonds')], 'PureStraight'],
        [[testCard(2, 'hearts'), testCard(5, 'hearts'), testCard(9, 'hearts')], 'Flush'],
        [[testCard(7, 'hearts'), testCard(7, 'clubs'), testCard(2, 'diamonds')], 'PureOnePair'],
        [[testCard(2, 'hearts'), testCard(4, 'clubs'), testCard(3, 'diamonds')], 'Straight'],
        [[testCard(7, 'hearts'), testCard(2, 'clubs'), testCard(7, 'diamonds')], 'OnePair'],
        [[testCard(2, 'hearts'), testCard(5, 'clubs'), testCard(9, 'diamonds')], 'HighCard'],
    ];
    assert.deepEqual(yHands.map(([cards]) => evaluateYHandForAchievement(cards).type), yHands.map(([, type]) => type));

    const xHands = [
        [[10, 11, 12, 13, 14].map(rank => testCard(rank, 'hearts')), 'RoyalFlush'],
        [[5, 6, 7, 8, 9].map(rank => testCard(rank, 'spades')), 'StraightFlush'],
        [[testCard(7, 'hearts'), testCard(7, 'diamonds'), testCard(7, 'clubs'), testCard(7, 'spades'), testCard(2, 'hearts')], 'FourOfAKind'],
        [[testCard(7, 'hearts'), testCard(7, 'diamonds'), testCard(7, 'clubs'), testCard(2, 'spades'), testCard(2, 'hearts')], 'FullHouse'],
        [[testCard(5, 'hearts'), testCard(6, 'diamonds'), testCard(7, 'clubs'), testCard(8, 'spades'), testCard(9, 'hearts')], 'Straight'],
        [[2, 5, 8, 11, 13].map(rank => testCard(rank, 'clubs')), 'Flush'],
        [[testCard(7, 'hearts'), testCard(7, 'diamonds'), testCard(7, 'clubs'), testCard(2, 'spades'), testCard(4, 'hearts')], 'ThreeOfAKind'],
        [[testCard(7, 'hearts'), testCard(7, 'diamonds'), testCard(5, 'clubs'), testCard(5, 'spades'), testCard(2, 'hearts')], 'TwoPair'],
        [[testCard(7, 'hearts'), testCard(7, 'diamonds'), testCard(2, 'clubs'), testCard(4, 'spades'), testCard(9, 'hearts')], 'OnePair'],
        [[testCard(2, 'hearts'), testCard(5, 'diamonds'), testCard(9, 'clubs'), testCard(11, 'spades'), testCard(13, 'hearts')], 'HighCard'],
    ];
    assert.deepEqual(xHands.map(([cards]) => evaluateXHandForAchievement(cards).type), xHands.map(([, type]) => type));
    assert.equal(ROLE_WIN_ACHIEVEMENT_TYPES.length, 19);
    assert.equal(new Set(ROLE_WIN_ACHIEVEMENT_TYPES).size, 19);
});

test('awards only the viewer hand types that actually win their showdowns', () => {
    const playerBoard = [
        [testCard(12, 'hearts'), testCard(7, 'spades'), testCard(2, 'spades'), testCard(4, 'hearts'), testCard(6, 'hearts')],
        [testCard(13, 'clubs'), testCard(7, 'hearts'), testCard(5, 'spades'), testCard(4, 'clubs'), testCard(8, 'clubs')],
        [testCard(14, 'diamonds'), testCard(7, 'clubs'), testCard(9, 'spades'), testCard(8, 'diamonds'), testCard(7, 'diamonds')],
    ];
    const opponentBoard = [
        [testCard(2, 'hearts'), testCard(3, 'diamonds'), testCard(3, 'hearts'), testCard(3, 'spades'), testCard(4, 'spades')],
        [testCard(5, 'clubs'), testCard(6, 'diamonds'), testCard(6, 'clubs'), testCard(14, 'hearts'), testCard(5, 'diamonds')],
        [testCard(9, 'diamonds'), testCard(10, 'diamonds'), testCard(13, 'spades'), testCard(3, 'clubs'), testCard(12, 'spades')],
    ];
    const moves = [];
    for (const playerIndex of [0, 1]) {
        const board = playerIndex === 0 ? playerBoard : opponentBoard;
        for (let row = 0; row < 3; row += 1) {
            for (let column = 0; column < 5; column += 1) {
                moves.push({ playerIndex, row, column, card: board[row][column] });
            }
        }
    }

    const record = { viewerPlayerIndex: 0, moves };
    assert.deepEqual(new Set(getWonHandAchievementTypes(record)), new Set([
        'y_win_pure_straight',
        'y_win_three_of_a_kind',
        'y_win_flush',
        'y_win_pure_one_pair',
        'y_win_straight',
        'x_win_one_pair',
    ]));
    assert.deepEqual(getWonHandAchievementTypes({ ...record, viewerPlayerIndex: 1 }), []);
});

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

test('assigns two different showdown voices and leaves one character unused', () => {
    assert.deepEqual(selectShowdownVoiceAssignment(() => 0), { p1: 'mana', p2: 'tsukuyomi' });
    assert.deepEqual(selectShowdownVoiceAssignment(maximum => maximum - 1), { p1: 'kurowa', p2: 'tsukuyomi' });
    for (let index = 0; index < 100; index += 1) {
        const assignment = selectShowdownVoiceAssignment();
        assert.notEqual(assignment.p1, assignment.p2);
        assert.ok(['mana', 'tsukuyomi', 'kurowa'].includes(assignment.p1));
        assert.ok(['mana', 'tsukuyomi', 'kurowa'].includes(assignment.p2));
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
