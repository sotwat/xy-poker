import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from './deck';
import { gameReducer, INITIAL_GAME_STATE } from './game';
import {
    attachGameRecordThought,
    beginGameRecording,
    buildReplayBoards,
    buildReplayHands,
    captureGameRecordMoves,
    finalizeGameRecord,
    getGameRecordExportFilename,
    getGameRecordResult,
    isGameRecordData,
    MAX_GAME_RECORD_THOUGHT_LENGTH,
    mergeGameRecords,
    normalizeGameRecordThought,
    serializeGameRecordText,
} from './gameRecord';

test('records placements and reconstructs the replay board', () => {
    let state = gameReducer(INITIAL_GAME_STATE, {
        type: 'START_GAME',
        payload: { initialDeck: createDeck(), initialDice: [6, 5, 4, 3, 2], startingPlayer: 0 },
    });
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
    let recording = beginGameRecording(state, '00000000-0000-4000-8000-000000000001', '2026-09-01T00:00:00.000Z');

    const card = state.players[0].hand[0];
    state = gameReducer(state, {
        type: 'PLACE_AND_DRAW',
        payload: { cardId: card.id, colIndex: 2, isHidden: true },
    });
    recording = captureGameRecordMoves(recording, state);

    assert.equal(recording.moves.length, 1);
    assert.deepEqual(recording.moves[0], {
        ply: 1,
        playerIndex: 0,
        card: { ...card, isHidden: true },
        column: 2,
        row: 0,
        drawnCards: [{ ...state.players[0].hand.at(-1)! }],
    });

    const initialHands = buildReplayHands({
        schemaVersion: 2,
        id: recording.id,
        startedAt: recording.startedAt,
        completedAt: '2026-09-01T00:10:00.000Z',
        mode: 'bot',
        viewerPlayerIndex: 0,
        playerNames: ['Player', 'AI'],
        dice: recording.dice,
        winner: 'p1',
        scores: [10, 5],
        bonuses: [0, 0],
        initialHands: recording.initialHands,
        moves: recording.moves,
    }, 0);
    assert.deepEqual(initialHands, recording.initialHands);

    const partialRecord = {
        schemaVersion: 1 as const,
        id: recording.id,
        startedAt: recording.startedAt,
        completedAt: '2026-09-01T00:10:00.000Z',
        mode: 'bot' as const,
        viewerPlayerIndex: 0 as const,
        playerNames: ['Player', 'AI'] as [string, string],
        dice: recording.dice,
        winner: 'p1' as const,
        scores: [10, 5] as [number, number],
        bonuses: [0, 0] as [number, number],
        moves: recording.moves,
    };
    const boards = buildReplayBoards(partialRecord, 1);
    assert.equal(boards[0][0][2]?.id, card.id);
    assert.equal(boards[0][0][2]?.isHidden, false);
    assert.equal(getGameRecordResult(partialRecord), 'win');
    assert.equal(isGameRecordData(partialRecord), false);
});

test('does not finalize an incomplete game record', () => {
    const state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME' });
    const recording = beginGameRecording(state, '00000000-0000-4000-8000-000000000002', '2026-09-01T00:00:00.000Z');
    assert.equal(finalizeGameRecord(recording, state, {
        completedAt: '2026-09-01T00:01:00.000Z',
        mode: 'bot',
        viewerPlayerIndex: 0,
        playerNames: ['Player', 'AI'],
    }), null);
});

test('finalizes and validates a complete thirty-move game', () => {
    let state = gameReducer(INITIAL_GAME_STATE, {
        type: 'START_GAME',
        payload: { initialDeck: createDeck(), initialDice: [6, 5, 4, 3, 2], startingPlayer: 0 },
    });
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
    let recording = beginGameRecording(state, '00000000-0000-4000-8000-000000000003', '2026-09-01T00:00:00.000Z');

    while (state.phase === 'playing') {
        const player = state.players[state.currentPlayerIndex];
        const column = player.board[2].findIndex(card => card === null);
        state = gameReducer(state, {
            type: 'PLACE_AND_DRAW',
            payload: { cardId: player.hand[0].id, colIndex: column, isHidden: false },
        });
        recording = captureGameRecordMoves(recording, state);
        if (recording.moves.length === 1) {
            const firstMove = recording.moves[0];
            recording = attachGameRecordThought(recording, {
                playerIndex: firstMove.playerIndex,
                cardId: firstMove.card.id,
                column: firstMove.column,
                text: '  出目6の列より、Qの純正ストレート2経路を優先する。\r\nAIの資源配分と比較する。  ',
            });
        }
    }
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });

    const record = finalizeGameRecord(recording, state, {
        completedAt: '2026-09-01T00:10:00.000Z',
        mode: 'bot',
        viewerPlayerIndex: 0,
        playerNames: ['Player', 'AI'],
    });
    assert.ok(record);
    assert.equal(record.schemaVersion, 3);
    assert.equal(record.moves.length, 30);
    assert.equal(record.moves[0].thought, '出目6の列より、Qの純正ストレート2経路を優先する。\nAIの資源配分と比較する。');
    assert.equal(isGameRecordData(record), true);
    assert.ok(JSON.stringify(record).length < 25_000);

    const weightedRecord = structuredClone(record);
    weightedRecord.trainingMetadata = {
        schemaVersion: 1,
        source: 'server',
        playerRating: 2000,
        playerGamesPlayed: 200,
        playerWins: 130,
        playerWinRate: 0.65,
        ratingConfidence: 0.9933,
        effectiveRating: 1997,
        sampleWeight: 2.373,
        skillTier: 'expert',
        aiPolicyId: 'xy-gto-a7',
        aiThinkTimeMs: 1000,
    };
    assert.equal(isGameRecordData(weightedRecord), true);
    assert.match(serializeGameRecordText(weightedRecord, 'ja'), /旧レート情報は学習評価に不使用/);
    assert.equal(mergeGameRecords([weightedRecord], [record])[0].trainingMetadata?.source, 'server');

    const forgedWeight = structuredClone(weightedRecord);
    forgedWeight.trainingMetadata.sampleWeight = 8;
    assert.equal(isGameRecordData(forgedWeight), false);

    const gameplayRecord = structuredClone(record);
    gameplayRecord.trainingMetadata = {
        schemaVersion: 2,
        source: 'server',
        assessmentBasis: 'gameplay',
        aiPolicyId: 'xy-gto-a7',
        aiThinkTimeMs: 1000,
    };
    assert.equal(isGameRecordData(gameplayRecord), true);
    assert.match(serializeGameRecordText(gameplayRecord, 'ja'), /評価基準 対局内容/);

    const replayBoards = buildReplayBoards(record, 30);
    assert.deepEqual(replayBoards, state.players.map(player => player.board.map(row => row.map(card => card ? { ...card, isHidden: false } : null))));
    const replayHands = buildReplayHands(record, 30);
    assert.deepEqual(replayHands, state.players.map(player => player.hand));

    const japaneseExport = serializeGameRecordText(record, 'ja');
    assert.match(japaneseExport, /^XYポーカー 棋譜/m);
    assert.match(japaneseExport, /サイコロ: 1列=6 \/ 2列=5 \/ 3列=4 \/ 4列=3 \/ 5列=2/);
    assert.match(japaneseExport, /初期手札/);
    assert.match(japaneseExport, /手順（1段目はサイコロ側）/);
    assert.match(japaneseExport, /30\. /);
    assert.match(japaneseExport, /最終盤面/);
    assert.match(japaneseExport, /PRO思考メモ: 出目6の列より/);

    const englishExport = serializeGameRecordText(record, 'en');
    assert.match(englishExport, /^XY Poker Game Record/m);
    assert.match(englishExport, /Moves \(Row 1 is closest to the dice\)/);
    assert.match(getGameRecordExportFilename(record), /^xy-poker-record-20260901-001000Z-[a-zA-Z0-9_-]+\.txt$/);

    const invalidRecord = structuredClone(record);
    invalidRecord.moves[0].drawnCards = [{ ...invalidRecord.initialHands[1][0] }];
    assert.equal(isGameRecordData(invalidRecord), false);

    const opponentThought = structuredClone(record);
    opponentThought.moves.find(move => move.playerIndex === 1)!.thought = '相手の思考は記録できない';
    assert.equal(isGameRecordData(opponentThought), false);

    const onlineThought = structuredClone(record);
    onlineThought.mode = 'ranked';
    assert.equal(isGameRecordData(onlineThought), false);

    const maximumNotes = structuredClone(record);
    for (const move of maximumNotes.moves.filter(move => move.playerIndex === maximumNotes.viewerPlayerIndex)) {
        move.thought = '戦'.repeat(MAX_GAME_RECORD_THOUGHT_LENGTH);
    }
    assert.equal(isGameRecordData(maximumNotes), true);
    assert.ok(JSON.stringify(maximumNotes).length < 25_000);

    assert.equal(normalizeGameRecordThought('  A\r\n B\u0000  '), 'A\nB');
    assert.equal(normalizeGameRecordThought('思'.repeat(400)).length, MAX_GAME_RECORD_THOUGHT_LENGTH);
});
