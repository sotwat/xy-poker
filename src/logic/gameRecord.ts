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

export interface GameRecordMoveV3 extends GameRecordMoveV2 {
    thought?: string;
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

export interface GameRecordDataV3 extends Omit<GameRecordBase, 'schemaVersion'> {
    schemaVersion: 3;
    initialHands: GameRecordHands;
    moves: GameRecordMoveV3[];
}

export type GameRecordData = LegacyGameRecordData | GameRecordDataV2 | GameRecordDataV3;
export type GameRecordTextLanguage = 'ja' | 'en';

export interface PendingGameRecordThought {
    playerIndex: 0 | 1;
    cardId: string;
    column: number;
    text: string;
}

export interface ActiveGameRecording {
    id: string;
    startedAt: string;
    dice: number[];
    initialHands: GameRecordHands;
    moves: GameRecordMoveV3[];
    lastBoards: [GameRecordBoard, GameRecordBoard];
    lastHands: GameRecordHands;
    lastTurnCount: number;
}

const LOCAL_RECORDS_KEY = 'xypoker_game_records_v1';
const MAX_LOCAL_RECORDS = 30;
export const MAX_GAME_RECORD_THOUGHT_LENGTH = 280;

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

export function normalizeGameRecordThought(value: string): string {
    return value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim())
        .join('\n')
        .trim()
        .slice(0, MAX_GAME_RECORD_THOUGHT_LENGTH);
}

/** Attaches a private PRO note only to the matching move that was just recorded. */
export function attachGameRecordThought(
    recording: ActiveGameRecording,
    pending: PendingGameRecordThought,
): ActiveGameRecording {
    const text = normalizeGameRecordThought(pending.text);
    if (!text) return recording;

    let moveIndex = -1;
    for (let index = recording.moves.length - 1; index >= 0; index -= 1) {
        const move = recording.moves[index];
        if (move.playerIndex === pending.playerIndex
            && move.card.id === pending.cardId
            && move.column === pending.column
            && move.thought === undefined) {
            moveIndex = index;
            break;
        }
    }
    if (moveIndex < 0) return recording;

    const moves = recording.moves.map((move, index) => index === moveIndex ? { ...move, thought: text } : move);
    return { ...recording, moves };
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
): GameRecordDataV3 | null {
    if (gameState.phase !== 'ended' || !gameState.winner) return null;
    const captured = captureGameRecordMoves(recording, gameState);
    if (captured.moves.length !== 30) return null;

    return {
        schemaVersion: 3,
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
    if (record.schemaVersion === 1) return null;

    const hands = record.initialHands.map(cloneHand) as GameRecordHands;
    const clampedMoveCount = Math.max(0, Math.min(record.moves.length, Math.trunc(moveCount)));

    for (const move of record.moves.slice(0, clampedMoveCount)) {
        const cardIndex = hands[move.playerIndex].findIndex(card => card.id === move.card.id);
        if (cardIndex >= 0) hands[move.playerIndex].splice(cardIndex, 1);
        hands[move.playerIndex].push(...move.drawnCards.map(card => ({ ...card })));
    }

    return hands;
}

const EXPORT_RANK_LABELS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const EXPORT_SUIT_LABELS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' } as const;

function formatExportCard(card: Card): string {
    return `${EXPORT_RANK_LABELS[card.rank] ?? card.rank}${EXPORT_SUIT_LABELS[card.suit]}`;
}

function formatExportName(name: string): string {
    return name.replace(/[\r\n\t]+/g, ' ').trim();
}

/** Creates a deterministic, human-readable UTF-8 game record for sharing or analysis. */
export function serializeGameRecordText(record: GameRecordData, language: GameRecordTextLanguage = 'ja'): string {
    const japanese = language === 'ja';
    const names = record.playerNames.map(formatExportName) as [string, string];
    const winnerName = record.winner === 'draw'
        ? (japanese ? '引き分け' : 'Draw')
        : names[record.winner === 'p1' ? 0 : 1];
    const mode = japanese
        ? { bot: 'AI対戦', ranked: 'ランク対戦', private: 'プライベート対戦' }[record.mode]
        : { bot: 'AI Match', ranked: 'Ranked Match', private: 'Private Match' }[record.mode];
    const finalBoards = buildReplayBoards(record, record.moves.length);
    const lines: string[] = japanese
        ? [
            'XYポーカー 棋譜',
            '================',
            `棋譜ID: ${record.id}`,
            `形式: ${mode}`,
            `開始: ${new Date(record.startedAt).toISOString()}`,
            `終了: ${new Date(record.completedAt).toISOString()}`,
            `プレイヤー: P1 ${names[0]} / P2 ${names[1]}`,
            `勝者: ${winnerName}`,
            `最終スコア: ${names[0]} ${record.scores[0]} - ${record.scores[1]} ${names[1]}`,
            `ボーナス: ${names[0]} ${record.bonuses[0]} / ${names[1]} ${record.bonuses[1]}`,
            `サイコロ: ${record.dice.map((die, index) => `${index + 1}列=${die}`).join(' / ')}`,
            '',
            '初期手札',
            '--------',
        ]
        : [
            'XY Poker Game Record',
            '====================',
            `Record ID: ${record.id}`,
            `Mode: ${mode}`,
            `Started: ${new Date(record.startedAt).toISOString()}`,
            `Completed: ${new Date(record.completedAt).toISOString()}`,
            `Players: P1 ${names[0]} / P2 ${names[1]}`,
            `Winner: ${winnerName}`,
            `Final score: ${names[0]} ${record.scores[0]} - ${record.scores[1]} ${names[1]}`,
            `Bonuses: ${names[0]} ${record.bonuses[0]} / ${names[1]} ${record.bonuses[1]}`,
            `Dice: ${record.dice.map((die, index) => `Column ${index + 1}=${die}`).join(' / ')}`,
            '',
            'Initial hands',
            '-------------',
        ];

    if (record.schemaVersion !== 1) {
        lines.push(`P1 ${names[0]}: ${record.initialHands[0].map(formatExportCard).join(' ')}`);
        lines.push(`P2 ${names[1]}: ${record.initialHands[1].map(formatExportCard).join(' ')}`);
    } else {
        lines.push(japanese ? 'この古い棋譜には手札データがありません。' : 'Hand data is unavailable in this legacy record.');
    }

    lines.push('', japanese ? '手順（1段目はサイコロ側）' : 'Moves (Row 1 is closest to the dice)', '------------------------');
    for (const move of record.moves) {
        const actor = names[move.playerIndex];
        const visibility = move.card.isHidden
            ? (japanese ? '伏せ札' : 'face down')
            : (japanese ? '表向き' : 'face up');
        const draw = record.schemaVersion !== 1
            ? record.moves[move.ply - 1].drawnCards.map(formatExportCard)
            : [];
        const placement = japanese
            ? `${String(move.ply).padStart(2, '0')}. ${actor}: ${formatExportCard(move.card)} → ${move.column + 1}列・${move.row + 1}段（ダイス${record.dice[move.column]}、${visibility}）`
            : `${String(move.ply).padStart(2, '0')}. ${actor}: ${formatExportCard(move.card)} → Column ${move.column + 1}, Row ${move.row + 1} (die ${record.dice[move.column]}, ${visibility})`;
        const drawText = draw.length > 0
            ? `${japanese ? ' / ドロー' : ' / Draw'}: ${draw.join(' ')}`
            : '';
        lines.push(`${placement}${drawText}`);
        if (record.schemaVersion === 3 && record.moves[move.ply - 1].thought) {
            const thoughtLines = record.moves[move.ply - 1].thought!.split('\n');
            lines.push(`${japanese ? '    PRO思考メモ' : '    PRO thought'}: ${thoughtLines[0]}`);
            for (const continuation of thoughtLines.slice(1)) lines.push(`      ${continuation}`);
        }
    }

    lines.push('', japanese ? '最終盤面（各行は左から1〜5列）' : 'Final board (each row is Columns 1–5)', '------------------------------');
    for (const playerIndex of [0, 1] as const) {
        lines.push(`P${playerIndex + 1} ${names[playerIndex]}`);
        for (let row = 0; row < 3; row += 1) {
            const cards = finalBoards[playerIndex][row].map(card => card ? formatExportCard(card) : '—').join(' | ');
            lines.push(`${japanese ? `${row + 1}段` : `Row ${row + 1}`}: ${cards}`);
        }
    }

    return `${lines.join('\n')}\n`;
}

export function getGameRecordExportFilename(record: GameRecordData): string {
    const completed = new Date(record.completedAt);
    const timestamp = Number.isNaN(completed.getTime())
        ? 'unknown-date'
        : completed.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-');
    const shortId = record.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8) || 'match';
    return `xy-poker-record-${timestamp}-${shortId}.txt`;
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
    if (![1, 2, 3].includes(record.schemaVersion ?? 0) || typeof record.id !== 'string') return false;
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
    const hands: GameRecordHands | null = record.schemaVersion !== 1
        && 'initialHands' in record
        && Array.isArray(record.initialHands)
        && record.initialHands.length === 2
        && record.initialHands.every(hand => Array.isArray(hand) && hand.length === 4 && hand.every(card => isRecordCard(card)))
        ? record.initialHands.map(hand => hand.map(card => ({ ...card }))) as GameRecordHands
        : null;

    if (record.schemaVersion !== 1 && !hands) return false;
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

        if (record.schemaVersion !== 1 && hands) {
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

        const thought = 'thought' in move ? move.thought : undefined;
        if ((record.schemaVersion ?? 0) < 3 && thought !== undefined) return false;
        if (record.schemaVersion === 3 && thought !== undefined) {
            if (move.playerIndex !== record.viewerPlayerIndex
                || typeof thought !== 'string'
                || thought !== normalizeGameRecordThought(thought)
                || thought.length < 1
                || thought.length > MAX_GAME_RECORD_THOUGHT_LENGTH) return false;
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
