import { createDeck } from '../src/logic/deck';
import { evaluateXHand, evaluateYHand } from '../src/logic/evaluation';
import { calculateXHandScores } from '../src/logic/scoring';
import { terminalReplyView } from './terminal_reply';
import type { Card, GameState, YHandResult } from '../src/logic/types';

type Move = { cardId: string; colIndex: number; isHidden: boolean };
type Metrics = { calls: number; computed: number; hits: number; worlds: number; changed: number; timedOut: number };
const deck = createDeck();
let enabled = false;
let cache = new Map<string, Move>();
let metrics: Metrics = { calls: 0, computed: 0, hits: 0, worlds: 0, changed: 0, timedOut: 0 };
export function setTerminalReplyEnabled(value: boolean) {
    enabled = value; cache = new Map();
    metrics = { calls: 0, computed: 0, hits: 0, worlds: 0, changed: 0, timedOut: 0 };
}
export function terminalReplyMetrics() { return { ...metrics }; }
function compare(a: YHandResult, b: YHandResult) {
    if (a.rankValue !== b.rankValue) return Math.sign(a.rankValue - b.rankValue);
    for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
        const difference = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
        if (difference) return Math.sign(difference);
    }
    return 0;
}
export function prepareTerminalPayoffs(board: (Card | null)[][], hand: Card[], column: number, dice: number[], actor: 0 | 1) {
    const fixedY = dice.map((_, col) => col === column ? null : evaluateYHand(board.map(r => r[col]!), 1));
    const candidates = hand.map(card => {
        const bottom = board[2].map((c, col) => col === column ? card : c!);
        return { x: evaluateXHand(bottom), y: evaluateYHand([board[0][column]!, board[1][column]!, card], 1) };
    });
    return (opponent: Card[][]) => {
        const otherX = evaluateXHand(opponent[2]);
        const otherY = dice.map((_, col) => evaluateYHand(opponent.map(r => r[col]), 1));
        return candidates.map(own => {
            if (own.x.type === 'RoyalFlush' || otherX.type === 'RoyalFlush') {
                const wins = own.x.type === 'RoyalFlush' && (actor === 0 || otherX.type !== 'RoyalFlush');
                return { utility: wins ? 1 : -1, margin: 0 };
            }
            const x = calculateXHandScores(own.x, otherX);
            const margin = dice.reduce((sum, die, col) => sum + die * compare(col === column ? own.y : fixedY[col]!, otherY[col]), 0) + x.p1Score - x.p2Score;
            return { utility: Math.sign(margin), margin };
        });
    };
}
export function chooseTerminalReply(state: GameState, actor: 0 | 1, baseline: Move, deadline = Infinity): Move {
    if (!enabled) return baseline;
    const view = terminalReplyView(state, actor);
    if (!view) return baseline;
    metrics.calls++;
    const key = JSON.stringify(view), cached = cache.get(key);
    if (cached) { metrics.hits++; if (cached.cardId !== baseline.cardId) metrics.changed++; return cached; }
    const known = new Set([...view.hand, ...view.ownBoard.flat(), ...view.opponentBoard.flat()].filter((c): c is Card => c !== null).map(c => c.id));
    const unseen = deck.filter(c => !known.has(c.id));
    const hidden: Array<[number, number]> = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) if (!view.opponentBoard[row][col]) hidden.push([row, col]);
    if (unseen.length < hidden.length) return baseline;
    let seed = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) seed = Math.imul(seed ^ key.charCodeAt(i), 0x01000193) >>> 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const column = view.ownBoard[2].findIndex(c => c === null), totals = view.hand.map(() => 0);
    if (performance.now() >= deadline) { metrics.timedOut++; return baseline; }
    const payoffs = prepareTerminalPayoffs(view.ownBoard, view.hand, column, view.dice, actor);
    const opponent = view.opponentBoard.map(r => [...r]) as Card[][];
    const samples = hidden.length ? 8 : 1;
    for (let sample = 0; sample < samples; sample++) {
        if (performance.now() >= deadline) { metrics.timedOut++; return baseline; }
        const remaining = [...unseen];
        for (const [row, col] of hidden) { const i = Math.floor(random() * remaining.length); opponent[row][col] = remaining[i]; remaining.splice(i, 1); }
        const values = payoffs(opponent);
        for (let card = 0; card < view.hand.length; card++) {
            const value = values[card];
            totals[card] += value.utility + Math.max(-0.45, Math.min(0.45, value.margin / 40));
        }
        metrics.worlds++;
    }
    if (performance.now() >= deadline) { metrics.timedOut++; return baseline; }
    const best = totals.reduce((chosen, value, i) => value > totals[chosen] ? i : chosen, 0);
    const result = { cardId: view.hand[best].id, colIndex: column, isHidden: false };
    cache.set(key, result); metrics.computed++;
    if (result.cardId !== baseline.cardId) metrics.changed++;
    return result;
}
