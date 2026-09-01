import type { Card, GameState } from './types';

export type GameRecordMode = 'bot' | 'ranked' | 'private';
export type GameRecordWinner = 'p1' | 'p2' | 'draw';
export type GameRecordBoard = (Card | null)[][];

export interface GameRecordMove {
    ply: number;
    playerIndex: 0 | 1;
    card: Card;
    column: number;
    row: number;
}

export interface GameRecordData {
    schemaVersion: 1;
    id: string;
    startedAt: string;
    completedAt: string;
    mode: GameRecordMode;
    viewerPlayerIndex: 0 | 1;
    playerNames: [string, string];
    dice: number[];
    winner: GameRecordWinner;
    scores: [number, number];
    bonuses: [number, number];
    moves: GameRecordMove[];
}

export interface ActiveGameRecording {
    id: string;
    startedAt: string;
    dice: number[];
    moves: GameRecordMove[];
    lastBoards: [GameRecordBoard, GameRecordBoard];
    lastTurnCount: number;
}

const LOCAL_RECORDS_KEY = 'xypoker_game_records_v1';
const MAX_LOCAL_RECORDS = 30;

function createEmptyBoard(): GameRecordBoard {
    return Array.from({ length: 3 }, () => Array<Card | null>(5).fill(null));
}

function cloneBoard(board: GameRecordBoard): GameRecordBoard {
    return board.map(row => row.map(card => card ? { ...card } : null));
}

function cloneBoards(gameState: GameState): [GameRecordBoard, GameRecordBoard] {
    return [cloneBoard(gameState.players[0].board), cloneBoard(gameState.players[1].board)];
}

export function beginGameRecording(gameState: GameState, id: string, startedAt: string): ActiveGameRecording {
    return {
        id,
        startedAt,
        dice: [...gameState.players[0].dice],
        moves: [],
        lastBoards: cloneBoards(gameState),
        lastTurnCount: gameState.turnCount,
    };
}

export function captureGameRecordMoves(recording: ActiveGameRecording, gameState: GameState): ActiveGameRecording {
    if (gameState.turnCount <= recording.lastTurnCount) return recording;

    const nextBoards = cloneBoards(gameState);
    const additions: Omit<GameRecordMove, 'ply'>[] = [];

    for (const playerIndex of [0, 1] as const) {
        for (let row = 0; row < 3; row += 1) {
            for (let column = 0; column < 5; column += 1) {
                const previousCard = recording.lastBoards[playerIndex][row][column];
                const nextCard = nextBoards[playerIndex][row][column];
                if (!previousCard && nextCard) {
                    additions.push({
                        playerIndex,
                        card: { ...nextCard, isHidden: Boolean(nextCard.isHidden) },
                        column,
                        row,
                    });
                }
            }
        }
    }

    const moves = [...recording.moves];
    for (const addition of additions) {
        moves.push({ ...addition, ply: moves.length + 1 });
    }

    return {
        ...recording,
        moves,
        lastBoards: nextBoards,
        lastTurnCount: gameState.turnCount,
    };
}

export function finalizeGameRecord(
    recording: ActiveGameRecording,
    gameState: GameState,
    metadata: {
        completedAt: string;
        mode: GameRecordMode;
        viewerPlayerIndex: 0 | 1;
        playerNames: [string, string];
    },
): GameRecordData | null {
    if (gameState.phase !== 'ended' || !gameState.winner) return null;
    const captured = captureGameRecordMoves(recording, gameState);
    if (captured.moves.length !== 30) return null;

    return {
        schemaVersion: 1,
        id: captured.id,
        startedAt: captured.startedAt,
        completedAt: metadata.completedAt,
        mode: metadata.mode,
        viewerPlayerIndex: metadata.viewerPlayerIndex,
        playerNames: metadata.playerNames,
        dice: [...captured.dice],
        winner: gameState.winner,
        scores: [gameState.players[0].score, gameState.players[1].score],
        bonuses: [gameState.players[0].bonusesClaimed, gameState.players[1].bonusesClaimed],
        moves: captured.moves,
    };
}

export function buildReplayBoards(record: GameRecordData, moveCount: number): [GameRecordBoard, GameRecordBoard] {
    const boards: [GameRecordBoard, GameRecordBoard] = [createEmptyBoard(), createEmptyBoard()];
    const clampedMoveCount = Math.max(0, Math.min(record.moves.length, Math.trunc(moveCount)));

    for (const move of record.moves.slice(0, clampedMoveCount)) {
        boards[move.playerIndex][move.row][move.column] = { ...move.card, isHidden: false };
    }
    return boards;
}

export function getGameRecordResult(record: GameRecordData): 'win' | 'loss' | 'draw' {
    if (record.winner === 'draw') return 'draw';
    return record.winner === `p${record.viewerPlayerIndex + 1}` ? 'win' : 'loss';
}

export function isGameRecordData(value: unknown): value is GameRecordData {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<GameRecordData>;
    if (record.schemaVersion !== 1 || typeof record.id !== 'string') return false;
    if (!record.startedAt || !Number.isFinite(Date.parse(record.startedAt))) return false;
    if (!record.completedAt || !Number.isFinite(Date.parse(record.completedAt))) return false;
    if (!['bot', 'ranked', 'private'].includes(record.mode || '')) return false;
    if (record.viewerPlayerIndex !== 0 && record.viewerPlayerIndex !== 1) return false;
    if (!Array.isArray(record.playerNames) || record.playerNames.length !== 2
        || !record.playerNames.every(name => typeof name === 'string' && name.length > 0 && name.length <= 15)) return false;
    if (!Array.isArray(record.dice) || record.dice.length !== 5
        || !record.dice.every(die => Number.isInteger(die) && die >= 1 && die <= 6)) return false;
    if (!['p1', 'p2', 'draw'].includes(record.winner || '')) return false;
    if (!Array.isArray(record.scores) || record.scores.length !== 2
        || !record.scores.every(score => Number.isInteger(score) && score >= 0)) return false;
    if (!Array.isArray(record.bonuses) || record.bonuses.length !== 2
        || !record.bonuses.every(bonus => Number.isInteger(bonus) && bonus >= 0 && bonus <= 5)) return false;
    if (!Array.isArray(record.moves) || record.moves.length !== 30) return false;

    return record.moves.every((move, index) => {
        if (!move || typeof move !== 'object') return false;
        return move.ply === index + 1
            && (move.playerIndex === 0 || move.playerIndex === 1)
            && Number.isInteger(move.column) && move.column >= 0 && move.column < 5
            && Number.isInteger(move.row) && move.row >= 0 && move.row < 3
            && Boolean(move.card)
            && typeof move.card.id === 'string'
            && ['hearts', 'diamonds', 'clubs', 'spades'].includes(move.card.suit)
            && Number.isInteger(move.card.rank) && move.card.rank >= 2 && move.card.rank <= 14;
    });
}

export function loadLocalGameRecords(): GameRecordData[] {
    try {
        const raw = localStorage.getItem(LOCAL_RECORDS_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(isGameRecordData) : [];
    } catch {
        return [];
    }
}

export function saveLocalGameRecord(record: GameRecordData): void {
    const records = loadLocalGameRecords().filter(candidate => candidate.id !== record.id);
    const nextRecords = [record, ...records]
        .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
        .slice(0, MAX_LOCAL_RECORDS);
    localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(nextRecords));
}

export function mergeGameRecords(...groups: GameRecordData[][]): GameRecordData[] {
    const byId = new Map<string, GameRecordData>();
    for (const record of groups.flat()) {
        if (isGameRecordData(record)) byId.set(record.id, record);
    }
    return [...byId.values()].sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
}
