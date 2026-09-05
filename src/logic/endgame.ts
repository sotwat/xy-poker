import { createDeck } from './deck';
import { evaluateXHand, evaluateYHand } from './evaluation';
import { calculateXHandScores } from './scoring';
import type { Card, GameState, XHandResult, YHandResult } from './types';

function compare(a: YHandResult, b: YHandResult): number {
    if (a.rankValue !== b.rankValue) return Math.sign(a.rankValue - b.rankValue);
    for (let i = 0; i < a.kickers.length; i++) {
        if (a.kickers[i] !== b.kickers[i]) return Math.sign(a.kickers[i] - b.kickers[i]);
    }
    return 0;
}

export interface EndgameValue {
    cardId: string;
    colIndex: number;
    utility: number;
    scoreDifference: number;
    dominates: string[];
    minimumUtility: number;
}

export interface FinalMoveAnalysis {
    moves: EndgameValue[];
    worlds: number;
    opponentCanRespond: boolean;
}

/** Certify terminal dominance, or a forced win against every possible final reply. */
export function solveFinalMove(state: GameState, playerIndex: 0 | 1, deadline = Infinity): FinalMoveAnalysis | null {
    const own = state.players[playerIndex], opponent = state.players[1 - playerIndex];
    if (state.phase !== 'playing' || state.currentPlayerIndex !== playerIndex
        || own.board.flat().filter(card => card === null).length !== 1) return null;
    const opponentEmpty = opponent.board.flat().filter(card => card === null).length;
    if (opponentEmpty > 1 || performance.now() >= deadline) return null;
    const column = own.board[2].findIndex(card => card === null);
    if (column < 0 || own.hand.length === 0) return null;
    const known = new Set([...own.hand, ...own.board.flat(), ...opponent.board.flat().filter(card => !card?.isHidden)]
        .filter((card): card is Card => card !== null).map(card => card.id));
    const unseen = createDeck().filter(card => !known.has(card.id));
    const hidden: Array<{ row: number; column: number }> = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
        if (opponent.board[row][col]?.isHidden || opponent.board[row][col] === null) hidden.push({ row, column: col });
    }
    if (hidden.length > 3 + opponentEmpty || unseen.length < hidden.length) return null;
    const values: EndgameValue[] = own.hand.map(card => ({ cardId: card.id, colIndex: column, utility: 0,
        scoreDifference: 0, dominates: [], minimumUtility: 1 }));
    const dominance = own.hand.map(() => own.hand.map(() => true));
    const ownY = own.board[0].map((_, col) => col === column ? null : evaluateYHand(own.board.map(row => row[col]!), 1));
    const candidateY = own.hand.map(card => evaluateYHand([own.board[0][column]!, own.board[1][column]!, card], 1));
    const candidateX = own.hand.map(card => evaluateXHand(own.board[2].map((value, col) => col === column ? card : value!)));
    const board = opponent.board.map(row => [...row]) as Card[][];
    const yCache = new Map<string, YHandResult>();
    const xCache = new Map<string, XHandResult>();
    let evaluated = 0;
    let timedOut = false;
    const visit = () => {
        if (timedOut) return;
        if ((evaluated++ & 127) === 0 && performance.now() >= deadline) { timedOut = true; return; }
        const opponentY = own.dice.map((_, col) => {
            const cards = board.map(row => row[col]);
            const key = cards.map(card => card.id).join(',');
            let result = yCache.get(key);
            if (!result) { result = evaluateYHand(cards, 1); yCache.set(key, result); }
            return result;
        });
        const xKey = board[2].map(card => card.id).join(',');
        let opponentX = xCache.get(xKey);
        if (!opponentX) { opponentX = evaluateXHand(board[2]); xCache.set(xKey, opponentX); }
        const fixed = ownY.reduce((sum, hand, col) => sum + (hand ? own.dice[col] * compare(hand, opponentY[col]) : 0), 0);
        const utilities = values.map((value, index) => {
            const ownX = candidateX[index];
            const x = calculateXHandScores(ownX, opponentX!);
            const difference = fixed + own.dice[column] * compare(candidateY[index], opponentY[column]) + x.p1Score - x.p2Score;
            // Match the reducer's Player 1 precedence if both sides have a royal flush.
            const royalWinner = ownX.type === 'RoyalFlush' && (playerIndex === 0 || opponentX!.type !== 'RoyalFlush')
                ? 1 : opponentX!.type === 'RoyalFlush' ? -1 : null;
            const utility = royalWinner ?? Math.sign(difference);
            value.minimumUtility = Math.min(value.minimumUtility, utility);
            value.utility += utility;
            value.scoreDifference += royalWinner === null ? difference : 0;
            return utility;
        });
        utilities.forEach((utility, candidate) => utilities.forEach((other, baseline) => {
            if (utility < other) dominance[candidate][baseline] = false;
        }));
    };
    const used = new Uint8Array(unseen.length);
    const enumerate = (slot: number): void => {
        if (timedOut) return;
        if (slot === hidden.length) { visit(); return; }
        const position = hidden[slot];
        for (let index = 0; index < unseen.length; index++) {
            if (used[index]) continue;
            used[index] = 1;
            board[position.row][position.column] = unseen[index];
            enumerate(slot + 1);
            used[index] = 0;
            if (timedOut) return;
        }
    };
    enumerate(0);
    if (timedOut || evaluated === 0) return null;
    values.forEach((value, index) => {
        value.dominates = own.hand.flatMap((card, other) => dominance[index][other] ? [card.id] : []);
        value.utility /= evaluated;
        value.scoreDifference /= evaluated;
    });
    return { moves: values.sort((a, b) => b.utility - a.utility || b.scoreDifference - a.scoreDifference),
        worlds: evaluated, opponentCanRespond: opponentEmpty === 1 };
}

export function certifiedEndgameReplacement(analysis: FinalMoveAnalysis, baselineCardId: string): EndgameValue | undefined {
    const baseline = analysis.moves.find(move => move.cardId === baselineCardId);
    if (!baseline) return undefined;
    if (analysis.opponentCanRespond) {
        // Pointwise dominance is insufficient when revealing a different card can change the reply.
        return baseline.minimumUtility < 1 ? analysis.moves.find(move => move.minimumUtility === 1) : undefined;
    }
    return analysis.moves.find(move => move.utility > baseline.utility && move.dominates.includes(baselineCardId));
}
