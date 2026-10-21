import { evaluateXHandForAchievement, evaluateYHandForAchievement } from './game-utils.js';

const compare = (a, b) => {
    if (a.rankValue !== b.rankValue) return Math.sign(a.rankValue - b.rankValue);
    for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
        const difference = (a.kickers[i] || 0) - (b.kickers[i] || 0);
        if (difference) return Math.sign(difference);
    }
    return 0;
};

export function scoreMatch(moves, dice) {
    const boards = [Array.from({ length: 3 }, () => Array(5).fill(null)), Array.from({ length: 3 }, () => Array(5).fill(null))];
    const bonuses = [0, 0];
    for (const move of moves) {
        boards[move.playerIndex][move.row][move.column] = move.card;
        if (move.row === 2 && !boards[1 - move.playerIndex][2][move.column]) bonuses[move.playerIndex]++;
    }
    if (boards.some(board => board.flat().some(card => !card))) throw new Error('Incomplete board');
    const x = boards.map(board => evaluateXHandForAchievement(board[2]));
    // The game ends immediately on a royal flush, before assigning score totals.
    if (x.some(hand => hand.type === 'RoyalFlush')) return { scores: [0, 0], bonuses, winner: x[0].type === 'RoyalFlush' ? 'p1' : 'p2' };
    const scores = x.map(hand => hand.baseScore);
    if (x[0].type === x[1].type) {
        const c = compare(x[0], x[1]);
        if (c) scores[c > 0 ? 0 : 1]++;
    }
    for (let col = 0; col < 5; col++) {
        const hands = boards.map(board => evaluateYHandForAchievement(board.map(row => row[col])));
        const c = compare(hands[0], hands[1]);
        if (c) scores[c > 0 ? 0 : 1] += dice[col];
    }
    return { scores, bonuses, winner: scores[0] === scores[1] ? 'draw' : scores[0] > scores[1] ? 'p1' : 'p2' };
}

export function verifyRewardRecord(record, deal) {
    if (record.schemaVersion < 2 || JSON.stringify(record.dice) !== JSON.stringify(deal.initialDice)) throw new Error('Deal mismatch');
    if (JSON.stringify(record.initialHands.map(h => h.map(c => c.id))) !== JSON.stringify([deal.initialDeck.slice(0, 4), deal.initialDeck.slice(4, 8)].map(h => h.map(c => c.id)))) throw new Error('Hand mismatch');
    const hands = [new Set(deal.initialDeck.slice(0, 4).map(c => c.id)), new Set(deal.initialDeck.slice(4, 8).map(c => c.id))];
    const counts = [Array(5).fill(0), Array(5).fill(0)];
    const hidden = [Array(5).fill(0), Array(5).fill(0)];
    const hiddenTotal = [0, 0];
    let deckIndex = 8;
    let next = record.moves[0].playerIndex;
    for (const move of record.moves) {
        const { playerIndex: p, column: col, card } = move;
        if (p !== next || !hands[p].has(card.id) || move.row !== counts[p][col] || counts[p][col] >= 3) throw new Error('Illegal move');
        if (card.isHidden && (++hidden[p][col] > 2 || ++hiddenTotal[p] > 3)) throw new Error('Hidden limit');
        counts[p][col]++;
        hands[p].delete(card.id);
        const drawCount = 1 + Number(counts[p][col] === 3 && counts[1 - p][col] < 3);
        const drawn = deal.initialDeck.slice(deckIndex, deckIndex + drawCount);
        if (JSON.stringify(drawn.map(c => c.id)) !== JSON.stringify(move.drawnCards.map(c => c.id))) throw new Error('Draw mismatch');
        drawn.forEach(c => hands[p].add(c.id));
        deckIndex += drawn.length;
        next = counts[1 - p].reduce((a, b) => a + b, 0) < 15 ? 1 - p : p;
    }
    const result = scoreMatch(record.moves, record.dice);
    if (JSON.stringify(record.scores) !== JSON.stringify(result.scores) || JSON.stringify(record.bonuses) !== JSON.stringify(result.bonuses) || record.winner !== result.winner) throw new Error('Score mismatch');
    return result;
}
