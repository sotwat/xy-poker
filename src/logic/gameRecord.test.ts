import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from './deck';
import { gameReducer, INITIAL_GAME_STATE } from './game';
import {
    beginGameRecording,
    buildReplayBoards,
    captureGameRecordMoves,
    finalizeGameRecord,
    getGameRecordResult,
    isGameRecordData,
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
    });

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
    }
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });

    const record = finalizeGameRecord(recording, state, {
        completedAt: '2026-09-01T00:10:00.000Z',
        mode: 'bot',
        viewerPlayerIndex: 0,
        playerNames: ['Player', 'AI'],
    });
    assert.ok(record);
    assert.equal(record.moves.length, 30);
    assert.equal(isGameRecordData(record), true);

    const replayBoards = buildReplayBoards(record, 30);
    assert.deepEqual(replayBoards, state.players.map(player => player.board.map(row => row.map(card => card ? { ...card, isHidden: false } : null))));
});
