import type { Card, GameState } from './types';

export type GameRecordMode = 'bot' | 'ranked' | 'private';
export type GameRecordWinner = 'p1' | 'p2' | 'draw';
export type GameRecordBoard = (Card | null)[][];
export type GameRecordHands = [Card[], Card[]];

export interface GameRecordMove {
    ply: number;
    playerIndex: 0 | 1;
    card: Card;
    column: number;
    row: number;
}

export interface GameRecordMoveV2 extends GameRecordMove {
    drawnCards: Card[];
}

interface GameRecordBase {
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
}

export interface LegacyGameRecordData extends GameRecordBase {
    schemaVersion: 1;
    moves: GameRecordMove[];
}

export interface GameRecordDataV2 extends Omit<GameRecordBase, 'schemaVersion'> {
    schemaVersion: 2;
    initialHands: GameRecordHands;
    moves: GameRecordMoveV2[];
}

export type GameRecordData = LegacyGameRecordData | GameRecordDataV2;

export interface ActiveGameRecording {
    id: string;
    startedAt: string;
    dice: number[];
    initialHands: GameRecordHands;
    moves: GameRecordMoveV2[];
    lastBoards: [GameRecordBoard, GameRecordBoard];
    lastHands: GameRecordHands;
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

function cloneHand(hand: Card[]): Card[] {
    return hand.map(card => ({ id: card.id, suit: card.suit, rank: card.rank }));
}

function cloneHands(gameState: GameState): GameRecordHands {
    return [cloneHand(gameState.players[0].hand), cloneHand(gameState.players[1].hand)];
}

export function beginGameRecording(gameState: GameState, id: string, startedAt: string): ActiveGameRecording {
    return {
        id,
        startedAt,
        dice: [...gameState.players[0].dice],
        initialHands: cloneHands(gameState),
        moves: [],
        lastBoards: cloneBoards(gameState),
        lastHands: cloneHands(gameState),
        lastTurnCount: gameState.turnCount,
    };
}

export function captureGameRecordMoves(recording: ActiveGameRecording, gameState: GameState): ActiveGameRecording {
    if (gameState.turnCount <= recording.lastTurnCount) return recording;

    const nextBoards = cloneBoards(gameState);
    const nextHands = cloneHands(gameState);
    const additions: Omit<GameRecordMoveV2, 'ply'>[] = [];

    for (const playerIndex of [0, 1] as const) {
        for (let row = 0; row < 3; row += 1) {
            for (let column = 0; column < 5; column += 1) {
                const previousCard = recording.lastBoards[playerIndex][row][column];
                const nextCard = nextBoards[playerIndex][row][column];
                if (!previousCard && nextCard) {
                    const previousHandIds = new Set(recording.lastHands[playerIndex].map(card => card.id));
                    additions.push({
                        playerIndex,
                        card: { ...nextCard, isHidden: Boolean(nextCard.isHidden) },
                        column,
                        row,
                        drawnCards: nextHands[playerIndex]
                            .filter(card => !previousHandIds.has(card.id))
                            .map(card => ({ ...card })),
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
        lastHands: nextHands,
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
): GameRecordDataV2 | null {
    if (gameState.phase !== 'ended' || !gameState.winner) return null;
    const captured = captureGameRecordMoves(recording, gameState);
    if (captured.moves.length !== 30) return null;

    return {
        schemaVersion: 2,
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
        initialHands: captured.initialHands.map(cloneHand) as GameRecordHands,
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

export function buildReplayHands(record: GameRecordData, moveCount: number): GameRecordHands | null {
    if (record.schemaVersion !== 2) return null;

    const hands = record.initialHands.map(cloneHand) as GameRecordHands;
    const clampedMoveCount = Math.max(0, Math.min(record.moves.length, Math.trunc(moveCount)));

    for (const move of record.moves.slice(0, clampedMoveCount)) {
        const cardIndex = hands[move.playerIndex].findIndex(card => card.id === move.card.id);
        if (cardIndex >= 0) hands[move.playerIndex].splice(cardIndex, 1);
        hands[move.playerIndex].push(...move.drawnCards.map(card => ({ ...card })));
    }

    return hands;
}

export function getGameRecordResult(record: GameRecordData): 'win' | 'loss' | 'draw' {
    if (record.winner === 'draw') return 'draw';
    return record.winner === `p${record.viewerPlayerIndex + 1}` ? 'win' : 'loss';
}

function isRecordCard(value: unknown, requireHidden = false): value is Card {
    if (!value || typeof value !== 'object') return false;
    const card = value as Partial<Card>;
    const validHidden = requireHidden
        ? typeof card.isHidden === 'boolean'
        : card.isHidden === undefined || card.isHidden === false;
    return typeof card.id === 'string'
        && card.id === `${card.suit}-${card.rank}`
        && ['hearts', 'diamonds', 'clubs', 'spades'].includes(card.suit || '')
        && Number.isInteger(card.rank)
        && Number(card.rank) >= 2
        && Number(card.rank) <= 14
        && validHidden;
}

export function isGameRecordData(value: unknown): value is GameRecordData {
    if (!value || typeof value !== 'object') return false;
    if (JSON.stringify(value).length > 25_000) return false;
    const record = value as Partial<GameRecordData> & { schemaVersion?: number };
    if ((record.schemaVersion !== 1 && record.schemaVersion !== 2) || typeof record.id !== 'string') return false;
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

    const occupiedSlots = new Set<string>();
    const usedCards = new Set<string>();
    const playerMoveCounts = [0, 0];
    const hands: GameRecordHands | null = record.schemaVersion === 2
        && 'initialHands' in record
        && Array.isArray(record.initialHands)
        && record.initialHands.length === 2
        && record.initialHands.every(hand => Array.isArray(hand) && hand.length === 4 && hand.every(card => isRecordCard(card)))
        ? record.initialHands.map(hand => hand.map(card => ({ ...card }))) as GameRecordHands
        : null;

    if (record.schemaVersion === 2 && !hands) return false;
    const introducedCards = new Set<string>();
    if (hands) {
        for (const card of hands.flat()) {
            if (introducedCards.has(card.id)) return false;
            introducedCards.add(card.id);
        }
    }

    const validMoves = record.moves.every((move, index) => {
        if (!move || typeof move !== 'object') return false;
        if (move.ply !== index + 1
            || (move.playerIndex !== 0 && move.playerIndex !== 1)
            || !Number.isInteger(move.column) || move.column < 0 || move.column >= 5
            || !Number.isInteger(move.row) || move.row < 0 || move.row >= 3
            || !isRecordCard(move.card, true)) return false;

        const slotKey = `${move.playerIndex}-${move.row}-${move.column}`;
        if (occupiedSlots.has(slotKey) || usedCards.has(move.card.id)) return false;
        occupiedSlots.add(slotKey);
        usedCards.add(move.card.id);
        playerMoveCounts[move.playerIndex] += 1;

        if (record.schemaVersion === 2 && hands) {
            const moveV2 = move as GameRecordMoveV2;
            const cardIndex = hands[move.playerIndex].findIndex(card => card.id === move.card.id);
            if (cardIndex < 0 || !Array.isArray(moveV2.drawnCards) || moveV2.drawnCards.length > 2) return false;
            hands[move.playerIndex].splice(cardIndex, 1);
            for (const drawnCard of moveV2.drawnCards) {
                if (!isRecordCard(drawnCard) || introducedCards.has(drawnCard.id)) return false;
                introducedCards.add(drawnCard.id);
                hands[move.playerIndex].push({ ...drawnCard });
            }
        }

        return true;
    });

    return validMoves && playerMoveCounts[0] === 15 && playerMoveCounts[1] === 15;
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
        if (!isGameRecordData(record)) continue;
        const existing = byId.get(record.id);
        if (!existing || record.schemaVersion >= existing.schemaVersion) byId.set(record.id, record);
    }
    return [...byId.values()].sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
}
