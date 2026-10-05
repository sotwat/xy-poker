import { certificateKnowledge } from './certificateKnowledge';
import { createDeck } from './deck';
import { evaluateXHand, evaluateYHand } from './evaluation';
import { calculateXHandScores, SCORING_RULES_VERSION } from './scoring';
import type { ForcedWinPlan } from './forcedWin';
import type { Card, GameState, XHandResult, YHandResult } from './types';

export interface SharedCardProof {
    status: 'proved' | 'refuted' | 'timeout' | 'unsupported';
    lowerBound: number | null;
    expectedCompletions: number;
    coveredCompletions: number;
    prunedBranches: number;
    visitedLeaves: number;
    work: number;
    counterexample: string[][] | null;
}

function compare(a: YHandResult, b: YHandResult) {
    if (a.rankValue !== b.rankValue) return Math.sign(a.rankValue - b.rankValue);
    for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
        const delta = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
        if (delta) return Math.sign(delta);
    }
    return 0;
}
const falling = (n: number, k: number) => Array.from({ length: k }, (_, i) => n - i).reduce((a, b) => a * b, 1);

/** Verify one held-card plan by covering every opposing completion. */
export function proveSharedCardPlan(state: GameState, actor: 0 | 1,
    moves: ForcedWinPlan['moves'], deadline = Infinity): SharedCardProof {
    const result: SharedCardProof = { status: 'unsupported', lowerBound: null, expectedCompletions: 0,
        coveredCompletions: 0, prunedBranches: 0, visitedLeaves: 0, work: 0, counterexample: null };
    let expired = false;
    const tick = () => {
        result.work++;
        if ((result.work & 31) === 1 && performance.now() >= deadline) expired = true;
        return expired;
    };
    if (performance.now() >= deadline) return { ...result, status: 'timeout' };
    const knowledge = certificateKnowledge(state, actor);
    if (!knowledge || state.phase !== 'playing' || state.currentPlayerIndex !== actor) return result;
    const own = state.players[actor], opponent = state.players[1 - actor], unseen = knowledge.unseen;
    const ownBoard = own.board.map(row => [...row]) as Card[][];
    const empty = own.board.flat().filter(card => !card).length;
    const usedHeld = new Set<string>(), usedSlots = new Set<string>();
    if (empty < 2 || empty > 3 || moves.length !== empty) return result;
    for (const move of moves) {
        const card = own.hand.find(card => card.id === move.cardId), key = `${move.row},${move.colIndex}`;
        if (!card || !Number.isInteger(move.row) || move.row < 0 || move.row > 2
            || !Number.isInteger(move.colIndex) || move.colIndex < 0 || move.colIndex > 4
            || own.board[move.row][move.colIndex] !== null || usedHeld.has(card.id) || usedSlots.has(key)
            || ownBoard.findIndex(row => row[move.colIndex] === null) !== move.row) return result;
        usedHeld.add(card.id); usedSlots.add(key); ownBoard[move.row][move.colIndex] = card;
    }
    const columns = Array.from({ length: 5 }, (_, col) => ({ col,
        rows: [0, 1, 2].filter(row => !opponent.board[row][col] || opponent.board[row][col]!.isHidden) }));
    const unknown = columns.reduce((n, col) => n + col.rows.length, 0);
    const bottom = columns.filter(col => col.rows.includes(2)).map(col => col.col);
    if (unknown > 6 || bottom.length > 3 || unseen.length > 31 || unseen.length < unknown) return result;
    result.expectedCompletions = falling(unseen.length, unknown);
    const ownX = evaluateXHand(ownBoard[2]);
    const ownY = columns.map(({ col }) => evaluateYHand(ownBoard.map(row => row[col]), 1));
    const opponentBoard = opponent.board.map(row => [...row]) as Card[][];
    type Row = { mask: number; bottomMask: number; cards: number[]; score: number };
    const tables: Row[][] = [];
    for (const { col, rows } of columns) {
        const table: Row[] = [], cards: number[] = [];
        const fill = (slot: number, mask: number, bottomMask: number): void => {
            if (tick()) return;
            if (slot === rows.length) {
                table.push({ mask, bottomMask, cards: [...cards], score: state.players[0].dice[col]
                    * compare(ownY[col], evaluateYHand(opponentBoard.map(row => row[col]), 1)) });
                return;
            }
            for (let i = 0; i < unseen.length; i++) if (!(mask & (1 << i))) {
                opponentBoard[rows[slot]][col] = unseen[i]; cards.push(i);
                fill(slot + 1, mask | (1 << i), bottomMask | (rows[slot] === 2 ? 1 << i : 0));
                cards.pop();
                if (expired) return;
            }
        };
        fill(0, 0, 0);
        table.sort((a, b) => a.score - b.score);
        tables.push(table);
        if (expired) return { ...result, status: 'timeout' };
    }
    const xTable: Array<{ mask: number; hand: XHandResult }> = [];
    const fillX = (slot: number, start: number, mask: number): void => {
        if (tick()) return;
        if (slot === bottom.length) {
            xTable.push({ mask, hand: evaluateXHand(opponentBoard[2]) });
            return;
        }
        for (let i = start; i <= unseen.length - (bottom.length - slot); i++) {
            opponentBoard[2][bottom[slot]] = unseen[i];
            fillX(slot + 1, i + 1, mask | (1 << i));
            if (expired) return;
        }
    };
    fillX(0, 0, 0);
    if (expired) return { ...result, status: 'timeout' };
    const selected: Row[] = [];
    let minimum = Infinity;
    const xMargin = (hand: XHandResult): number => {
        const ownRoyal = ownX.type === 'RoyalFlush', opponentRoyal = hand.type === 'RoyalFlush';
        if (ownRoyal && (actor === 0 || !opponentRoyal)) return Infinity;
        if (opponentRoyal) return -Infinity;
        const score = calculateXHandScores(ownX, hand);
        return score.p1Score - score.p2Score;
    };
    const visit = (column: number, used: number, bottomUsed: number, assigned: number, yScore: number): boolean => {
        if (tick()) return false;
        let lower = yScore, xLower = Infinity, compatibleX = false;
        for (const row of xTable) {
            if (tick()) return false;
            if ((row.mask & bottomUsed) !== bottomUsed || (row.mask & (used ^ bottomUsed))) continue;
            compatibleX = true; xLower = Math.min(xLower, xMargin(row.hand));
        }
        if (!compatibleX) throw new Error('Incomplete X factor table');
        lower += xLower;
        for (let col = column; col < 5; col++) {
            let yLower = Infinity;
            for (const row of tables[col]) {
                if (tick()) return false;
                if (!(row.mask & used)) { yLower = row.score; break; }
            }
            if (!Number.isFinite(yLower)) throw new Error('Incomplete Y factor table');
            lower += yLower;
        }
        if (lower > 0) {
            result.coveredCompletions += falling(unseen.length - assigned, unknown - assigned);
            if (column === 5) result.visitedLeaves++; else result.prunedBranches++;
            minimum = Math.min(minimum, lower);
            return true;
        }
        if (column === 5) {
            result.visitedLeaves++;
            result.counterexample = opponent.board.map(row => row.map(card => card?.id ?? ''));
            selected.forEach((entry, col) => columns[col].rows.forEach((r, i) => {
                result.counterexample![r][col] = unseen[entry.cards[i]].id;
            }));
            return false;
        }
        for (const row of tables[column]) if (!(row.mask & used)) {
            selected[column] = row;
            if (!visit(column + 1, used | row.mask, bottomUsed | row.bottomMask,
                assigned + columns[column].rows.length, yScore + row.score)) return false;
        }
        return true;
    };
    const proved = visit(0, 0, 0, 0, 0);
    if (expired || performance.now() >= deadline) return { ...result, status: 'timeout', counterexample: null };
    if (proved && result.coveredCompletions !== result.expectedCompletions) throw new Error('Incomplete proof coverage');
    return { ...result, status: proved ? 'proved' : 'refuted', lowerBound: proved && Number.isFinite(minimum) ? minimum : null };
}

export interface SharedCardSearch {
    status: 'proved' | 'not-found' | 'timeout' | 'unsupported';
    moves: ForcedWinPlan['moves'] | null;
    proof: SharedCardProof | null;
    candidates: number;
    counterexampleRejections: number;
    proofCalls: number;
}

/** Keep opponent counterexamples across fixed-plan attempts within one bounded search. */
export function findSharedCardPlan(state: GameState, actor: 0 | 1, deadline: number): SharedCardSearch {
    const result: SharedCardSearch = { status: 'unsupported', moves: null, proof: null,
        candidates: 0, counterexampleRejections: 0, proofCalls: 0 };
    if (performance.now() >= deadline) return { ...result, status: 'timeout' };
    const knowledge = certificateKnowledge(state, actor);
    if (!knowledge || state.phase !== 'playing' || state.currentPlayerIndex !== actor) return result;
    const own = state.players[actor], other = state.players[1 - actor];
    const slots = Array.from({ length: 5 }, (_, colIndex) => [0, 1, 2]
        .filter(row => own.board[row][colIndex] === null).map(row => ({ row, colIndex }))).flat();
    const unknown = other.board.flat().filter(c => !c || c.isHidden).length;
    const bottom = other.board[2].filter(c => !c || c.isHidden).length;
    if (slots.length < 2 || slots.length > 3 || own.hand.length < slots.length
        || unknown > 6 || bottom > 3 || knowledge.unseen.length > 31) return result;
    result.status = 'not-found';
    const canonical = new Map(createDeck().map(c => [c.id, c]));
    const counterexamples: Array<{ y: YHandResult[]; x: XHandResult }> = [];
    const board = own.board.map(row => [...row]) as Card[][];
    const held = new Set<string>(), moves: ForcedWinPlan['moves'] = [];
    const failsCounterexample = () => {
        const x = evaluateXHand(board[2]);
        const y = [0, 1, 2, 3, 4].map(col => evaluateYHand(board.map(row => row[col]), 1));
        return counterexamples.some(other => {
            const ownRoyal = x.type === 'RoyalFlush', otherRoyal = other.x.type === 'RoyalFlush';
            if (ownRoyal && (actor === 0 || !otherRoyal)) return false;
            if (otherRoyal) return true;
            const scores = calculateXHandScores(x, other.x);
            return state.players[0].dice.reduce((sum, die, col) => sum + die * compare(y[col], other.y[col]),
                scores.p1Score - scores.p2Score) <= 0;
        });
    };
    const enumerate = (slot: number): void => {
        if (result.status === 'proved' || result.status === 'timeout') return;
        if (performance.now() >= deadline) { result.status = 'timeout'; return; }
        if (slot < slots.length) {
            const position = slots[slot];
            for (const card of own.hand) if (!held.has(card.id)) {
                held.add(card.id); board[position.row][position.colIndex] = card;
                moves.push({ ...position, cardId: card.id, isHidden: false });
                enumerate(slot + 1); moves.pop(); held.delete(card.id);
                if (result.status !== 'not-found') return;
            }
            return;
        }
        result.candidates++;
        if (failsCounterexample()) { result.counterexampleRejections++; return; }
        result.proofCalls++;
        const proof = proveSharedCardPlan(state, actor, moves, deadline);
        if (proof.status === 'proved') {
            result.status = 'proved'; result.moves = [...moves]; result.proof = proof;
        } else if (proof.status === 'timeout') result.status = 'timeout';
        else if (proof.status === 'refuted') {
            const completion = proof.counterexample!.map(row => row.map(id => canonical.get(id)!));
            counterexamples.push({ y: [0, 1, 2, 3, 4].map(col => evaluateYHand(completion.map(row => row[col]), 1)),
                x: evaluateXHand(completion[2]) });
        } else result.status = 'unsupported';
    };
    enumerate(0);
    if (performance.now() >= deadline) return { ...result, status: 'timeout', moves: null, proof: null };
    return result;
}

/** Production scope: four unknown cards, after the existing certificates, within their deadline. */
export function findSharedForcedWinPlan(state: GameState, actor: 0 | 1, deadline: number): ForcedWinPlan | null {
    if (performance.now() >= deadline) return null;
    const knowledge = certificateKnowledge(state, actor);
    if (!knowledge || state.players[1 - actor].board.flat().filter(c => !c || c.isHidden).length !== 4) return null;
    const search = findSharedCardPlan(state, actor, Math.min(deadline, performance.now() + 50));
    if (search.status !== 'proved' || !search.moves || !search.proof || performance.now() >= deadline) return null;
    const own = state.players[actor], opponent = state.players[1 - actor], proof = search.proof;
    return { playerIndex: actor, moves: search.moves, rulesVersion: SCORING_RULES_VERSION,
        boundMethod: 'joint-branches', royalWin: proof.lowerBound === null, scoreLowerBound: proof.lowerBound,
        evaluatedHands: proof.work, opponentCompletions: proof.coveredCompletions,
        expectedOpponentCompletions: proof.expectedCompletions, fullyCovered: true,
        prunedBranches: proof.prunedBranches, visitedLeaves: proof.visitedLeaves,
        knownOwnIds: knowledge.knownOwnIds, unseenIds: knowledge.unseen.map(c => c.id),
        ownBoard: own.board.map(row => row.map(c => c?.id ?? null)),
        opponentVisible: opponent.board.map(row => row.map(c => c && !c.isHidden ? c.id : null)),
        dice: [...state.players[0].dice] };
}
