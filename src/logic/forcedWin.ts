import { certificateKnowledge } from './certificateKnowledge';
import { evaluateXHand, evaluateYHand } from './evaluation';
import { calculateXHandScores, getXHandBaseScore, SCORING_RULES_VERSION } from './scoring';
import type { Card, GameState, XHandResult, YHandResult } from './types';
import { findJointForcedWinPlan } from './jointForcedWin';

interface Placement {
    cardId: string;
    colIndex: number;
    row: number;
    isHidden: false;
}

export interface ForcedWinPlan {
    rulesVersion: string;
    boundMethod?: 'independent-hands' | 'joint-completions';
    opponentCompletions?: number;
    expectedOpponentCompletions?: number;
    fullyEnumerated?: true;
    playerIndex: 0 | 1;
    moves: Placement[];
    scoreLowerBound: number | null;
    royalWin: boolean;
    evaluatedHands: number;
    ownBoard: (string | null)[][];
    knownOwnIds: string[];
    opponentVisible: (string | null)[][];
    unseenIds: string[];
    dice: number[];
}

function compare(a: YHandResult | XHandResult, b: YHandResult | XHandResult): number {
    if (a.rankValue !== b.rankValue) return Math.sign(a.rankValue - b.rankValue);
    for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
        const difference = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
        if (difference) return Math.sign(difference);
    }
    return 0;
}

/** Use inexpensive independent bounds before enumerating a small whole-board uncertainty set. */
export function findForcedWinPlan(state: GameState, playerIndex: 0 | 1, deadline = Infinity): ForcedWinPlan | null {
    const independent = findIndependentForcedWinPlan(state, playerIndex, deadline);
    if (independent || performance.now() >= deadline) return independent;
    return findJointForcedWinPlan(state, playerIndex, deadline);
}

/** Bound each opponent hand independently; incompatible maxima only make the certificate stricter. */
export function findIndependentForcedWinPlan(state: GameState, playerIndex: 0 | 1, deadline = Infinity): ForcedWinPlan | null {
    if (state.phase !== 'playing' || state.currentPlayerIndex !== playerIndex || performance.now() >= deadline) return null;
    const knowledge = certificateKnowledge(state, playerIndex);
    if (!knowledge) return null;
    const { knownOwnIds, unseen } = knowledge;
    const own = state.players[playerIndex], opponent = state.players[1 - playerIndex];
    const slots: Array<{ row: number; colIndex: number }> = [];
    for (let colIndex = 0; colIndex < 5; colIndex++) for (let row = 0; row < 3; row++) {
        if (own.board[row][colIndex] === null) slots.push({ row, colIndex });
    }
    if (slots.length < 2 || slots.length > 3 || own.hand.length < slots.length
        || opponent.board.flat().filter(card => card === null).length > 3) return null;
    let evaluatedHands = 0;
    let timedOut = false;
    const checkTime = () => {
        if ((evaluatedHands++ & 63) === 0 && performance.now() >= deadline) timedOut = true;
        return timedOut;
    };
    const complete = (cards: (Card | null)[], ordered: boolean, visit: (hand: Card[]) => void) => {
        const unknown = cards.flatMap((card, index) => !card || card.isHidden ? [index] : []);
        const board = [...cards] as Card[];
        const used = new Uint8Array(unseen.length);
        const enumerate = (slot: number, start: number): void => {
            if (timedOut) return;
            if (slot === unknown.length) {
                if (!checkTime()) visit(board);
                return;
            }
            for (let i = start; i < unseen.length; i++) {
                if (used[i]) continue;
                used[i] = 1;
                board[unknown[slot]] = unseen[i];
                enumerate(slot + 1, ordered ? 0 : i + 1);
                used[i] = 0;
                if (timedOut) return;
            }
        };
        enumerate(0, 0);
    };
    const opponentY: YHandResult[] = [];
    for (let column = 0; column < 5; column++) {
        let strongest: YHandResult | undefined;
        complete(opponent.board.map(row => row[column]), true, cards => {
            const hand = evaluateYHand(cards, 1);
            if (!strongest || compare(hand, strongest) > 0) strongest = hand;
        });
        if (timedOut || !strongest) return null;
        opponentY.push(strongest);
    }
    let opponentX: XHandResult | undefined;
    complete(opponent.board[2], false, cards => {
        const hand = evaluateXHand(cards);
        // XY awards a Straight more points than a Flush, unlike rankValue's ordering.
        const scoreDifference = opponentX ? getXHandBaseScore(hand.type) - getXHandBaseScore(opponentX.type) : 1;
        if (!opponentX || scoreDifference > 0 || (scoreDifference === 0 && compare(hand, opponentX) > 0)) opponentX = hand;
    });
    if (timedOut || !opponentX) return null;
    const strongestX = opponentX;
    const board = own.board.map(row => [...row]) as Card[][];
    const used = new Set<string>();
    const moves: Placement[] = [];
    let result: ForcedWinPlan | null = null;
    const enumeratePlans = (slot: number): void => {
        if (result || timedOut) return;
        if (slot < slots.length) {
            const position = slots[slot];
            for (const card of own.hand) if (!used.has(card.id)) {
                used.add(card.id);
                board[position.row][position.colIndex] = card;
                moves.push({ ...position, cardId: card.id, isHidden: false });
                enumeratePlans(slot + 1);
                moves.pop();
                used.delete(card.id);
                if (result || timedOut) return;
            }
            return;
        }
        if (checkTime()) return;
        const ownX = evaluateXHand(board[2]);
        const royalWin = ownX.type === 'RoyalFlush' && (playerIndex === 0 || strongestX.type !== 'RoyalFlush');
        if (!royalWin && strongestX.type === 'RoyalFlush') return;
        const x = calculateXHandScores(ownX, strongestX);
        const lowerBound = state.players[0].dice.reduce((sum, die, col) =>
            sum + die * compare(evaluateYHand(board.map(row => row[col]), 1), opponentY[col]), 0)
            + x.p1Score - x.p2Score;
        if (!royalWin && lowerBound <= 0) return;
        result = {
            playerIndex, moves: [...moves], scoreLowerBound: royalWin ? null : lowerBound, royalWin, boundMethod: 'independent-hands', rulesVersion: SCORING_RULES_VERSION,
            evaluatedHands, knownOwnIds, unseenIds: unseen.map(card => card.id),
            ownBoard: own.board.map(row => row.map(card => card?.id ?? null)),
            opponentVisible: opponent.board.map(row => row.map(card => card && !card.isHidden ? card.id : null)),
            dice: [...state.players[0].dice],
        };
    };
    enumeratePlans(0);
    return timedOut || performance.now() >= deadline ? null : result;
}

/** Keep a proven continuation even when the next turn has no search budget. */
export function continueForcedWinPlan(state: GameState, plan: ForcedWinPlan): Placement | null {
    if (state.phase !== 'playing' || state.currentPlayerIndex !== plan.playerIndex
        || plan.rulesVersion !== SCORING_RULES_VERSION
        || state.players[0].dice.some((die, index) => die !== plan.dice[index])) return null;
    if (!certificateKnowledge(state, plan.playerIndex)) return null;
    const own = state.players[plan.playerIndex], opponent = state.players[1 - plan.playerIndex];
    const expected = plan.ownBoard.map(row => [...row]);
    let next = 0;
    while (next < plan.moves.length) {
        const move = plan.moves[next];
        if (own.board[move.row][move.colIndex]?.id !== move.cardId) break;
        expected[move.row][move.colIndex] = move.cardId;
        next++;
    }
    if (next === plan.moves.length || own.board.some((row, r) => row.some((card, c) => (card?.id ?? null) !== expected[r][c]))) return null;
    const held = new Set(own.hand.map(card => card.id));
    if (plan.moves.slice(next).some(move => !held.has(move.cardId))) return null;
    const owned = new Set([...held, ...own.board.flat().flatMap(card => card ? [card.id] : [])]);
    if (plan.knownOwnIds.some(id => !owned.has(id))) return null;
    const unseen = new Set(plan.unseenIds);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
        const card = opponent.board[row][col], knownId = plan.opponentVisible[row][col];
        if (knownId ? !card || card.isHidden || card.id !== knownId : card && !card.isHidden && !unseen.has(card.id)) return null;
    }
    return { ...plan.moves[next] };
}
