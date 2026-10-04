import { certificateKnowledge } from './certificateKnowledge';
import { evaluateXHand, evaluateYHand } from './evaluation';
import { calculateXHandScores, SCORING_RULES_VERSION } from './scoring';
import type { ForcedWinPlan } from './forcedWin';
import type { Card, GameState, XHandResult, YHandResult } from './types';

// At least 15 own and 12 opposing public cards are known in the largest supported domain.
export const MAX_JOINT_COMPLETIONS = 25 * 24 * 23;

function compare(a: YHandResult, b: YHandResult): number {
    if (a.rankValue !== b.rankValue) return Math.sign(a.rankValue - b.rankValue);
    for (let index = 0; index < Math.max(a.kickers.length, b.kickers.length); index++) {
        const difference = (a.kickers[index] ?? 0) - (b.kickers[index] ?? 0);
        if (difference) return Math.sign(difference);
    }
    return 0;
}

/** Enumerate the whole opposing board, retaining shared-card constraints between Y and X. */
export function findJointForcedWinPlan(state: GameState, playerIndex: 0 | 1, deadline = Infinity): ForcedWinPlan | null {
    if (state.phase !== 'playing' || state.currentPlayerIndex !== playerIndex || performance.now() >= deadline) return null;
    const knowledge = certificateKnowledge(state, playerIndex);
    if (!knowledge) return null;
    const { knownOwnIds, unseen } = knowledge;
    const own = state.players[playerIndex], opponent = state.players[1 - playerIndex];
    const slots: Array<{ row: number; colIndex: number }> = [];
    for (let colIndex = 0; colIndex < 5; colIndex++) for (let row = 0; row < 3; row++) {
        if (own.board[row][colIndex] === null) slots.push({ row, colIndex });
    }
    const unknown: Array<{ row: number; colIndex: number }> = [];
    for (let row = 0; row < 3; row++) for (let colIndex = 0; colIndex < 5; colIndex++) {
        const card = opponent.board[row][colIndex];
        if (!card || card.isHidden) unknown.push({ row, colIndex });
    }
    if (slots.length < 2 || slots.length > 3 || own.hand.length < slots.length || unknown.length > 3) return null;
    if (unseen.length < unknown.length) return null;
    const expectedOpponentCompletions = unknown.reduce((count, _, index) => count * (unseen.length - index), 1);
    if (expectedOpponentCompletions > MAX_JOINT_COMPLETIONS) return null;
    let work = 0, timedOut = false;
    const checkTime = () => {
        work++;
        if (performance.now() >= deadline) timedOut = true;
        return timedOut;
    };
    const board = opponent.board.map(row => [...row]) as Card[][];
    const fixedY = opponent.board[0].map((_, column) =>
        unknown.some(slot => slot.colIndex === column) ? null : evaluateYHand(board.map(row => row[column]), 1));
    const fixedX = unknown.some(slot => slot.row === 2) ? null : evaluateXHand(board[2]);
    const xUnknown = unknown.filter(slot => slot.row === 2).length;
    const cacheX = xUnknown > 0 && xUnknown < unknown.length;
    const xCache = new Map<string, XHandResult>();
    const variableColumns = [...new Set(unknown.map(slot => slot.colIndex))];
    const worlds: Array<{ y: YHandResult[]; x: XHandResult }> = [];
    const used = new Uint8Array(unseen.length);
    const enumerateWorlds = (slot: number): void => {
        if (timedOut) return;
        if (slot === unknown.length) {
            if (checkTime()) return;
            const xKey = cacheX ? board[2].map(card => card.id).join(',') : '';
            let x = fixedX ?? (cacheX ? xCache.get(xKey) : undefined);
            if (!x) {
                x = evaluateXHand(board[2]);
                if (cacheX) xCache.set(xKey, x);
            }
            worlds.push({ y: fixedY.map((hand, column) => hand ?? evaluateYHand(board.map(row => row[column]), 1)),
                x });
            return;
        }
        const position = unknown[slot];
        for (let index = 0; index < unseen.length; index++) {
            if (used[index]) continue;
            used[index] = 1;
            board[position.row][position.colIndex] = unseen[index];
            enumerateWorlds(slot + 1);
            used[index] = 0;
            if (timedOut) return;
        }
    };
    enumerateWorlds(0);
    if (timedOut || worlds.length === 0 || worlds.length !== expectedOpponentCompletions) return null;
    const opponentCanRoyal = worlds.some(world => world.x.type === 'RoyalFlush');
    const ownBoard = own.board.map(row => [...row]) as Card[][];
    const held = new Set<string>();
    const moves: ForcedWinPlan['moves'] = [];
    let result: ForcedWinPlan | null = null;
    const enumeratePlans = (slot: number): void => {
        if (result || timedOut) return;
        if (slot < slots.length) {
            const position = slots[slot];
            for (const card of own.hand) if (!held.has(card.id)) {
                held.add(card.id);
                ownBoard[position.row][position.colIndex] = card;
                moves.push({ ...position, cardId: card.id, isHidden: false });
                enumeratePlans(slot + 1);
                moves.pop();
                held.delete(card.id);
                if (result || timedOut) return;
            }
            return;
        }
        if (checkTime()) return;
        const x = evaluateXHand(ownBoard[2]);
        const royalWin = x.type === 'RoyalFlush' && (playerIndex === 0 || !opponentCanRoyal);
        if (!royalWin && opponentCanRoyal) return;
        const y = ownBoard[0].map((_, column) => evaluateYHand(ownBoard.map(row => row[column]), 1));
        const fixedMargin = fixedY.reduce((sum, hand, column) =>
            sum + (hand ? state.players[0].dice[column] * compare(y[column], hand) : 0), 0);
        let lowerBound = Infinity;
        if (!royalWin) for (const world of worlds) {
            if (checkTime()) return;
            const scores = calculateXHandScores(x, world.x);
            const margin = variableColumns.reduce((sum, column) =>
                sum + state.players[0].dice[column] * compare(y[column], world.y[column]), fixedMargin)
                + scores.p1Score - scores.p2Score;
            if (margin <= 0) return;
            lowerBound = Math.min(lowerBound, margin);
        }
        result = {
            playerIndex, moves: [...moves], royalWin, scoreLowerBound: royalWin ? null : lowerBound, rulesVersion: SCORING_RULES_VERSION,
            evaluatedHands: work, knownOwnIds, unseenIds: unseen.map(card => card.id),
            ownBoard: own.board.map(row => row.map(card => card?.id ?? null)),
            opponentVisible: opponent.board.map(row => row.map(card => card && !card.isHidden ? card.id : null)),
            dice: [...state.players[0].dice], boundMethod: 'joint-completions', opponentCompletions: worlds.length,
            expectedOpponentCompletions, fullyEnumerated: true,
        };
    };
    enumeratePlans(0);
    return timedOut || performance.now() >= deadline ? null : result;
}
