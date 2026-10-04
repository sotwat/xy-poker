import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { evaluateXHand, evaluateYHand } from '../src/logic/evaluation';
import type { Card } from '../src/logic/types';

const started = performance.now();
const outputPath = process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? 'gto_evaluator_audit.json';
const deck = createDeck();
const xCounts: Record<string, number> = {};
const yCounts: Record<string, number> = {};
let xHands = 0, wheelFlushes = 0, yHands = 0, splitPairs = 0;
const suitSwap = (card: Card): Card => {
    const index = ['hearts', 'diamonds', 'clubs', 'spades'].indexOf(card.suit);
    return deck[((index + 1) % 4) * 13 + card.rank - 2];
};
for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++)
for (let c = b + 1; c < 52; c++) for (let d = c + 1; d < 52; d++)
for (let e = d + 1; e < 52; e++) {
    const cards = [deck[a], deck[b], deck[c], deck[d], deck[e]];
    const result = evaluateXHand(cards);
    xCounts[result.type] = (xCounts[result.type] ?? 0) + 1;
    xHands++;
    if (result.type === 'StraightFlush') {
        const ranks = cards.map(card => card.rank).sort((i, j) => i - j);
        const high = ranks.join(',') === '2,3,4,5,14' ? 5 : ranks[4];
        assert.deepEqual(result.kickers, [high]);
        if (high === 5) wheelFlushes++;
    }
}
// Independent category totals from rank multiplicities and suit choices.
assert.deepEqual(xCounts, {
    StraightFlush: 36, Flush: 5108, OnePair: 1098240, TwoPair: 123552,
    ThreeOfAKind: 54912, FullHouse: 3744, FourOfAKind: 624,
    Straight: 10200, HighCard: 1302540, RoyalFlush: 4,
});
assert.equal(xHands, 2598960);
assert.equal(wheelFlushes, 4);
for (let a = 0; a < 52; a++) for (let b = 0; b < 52; b++) {
    if (a === b) continue;
    for (let c = 0; c < 52; c++) {
        if (c === a || c === b) continue;
        const cards = [deck[a], deck[b], deck[c]];
        const result = evaluateYHand(cards, 1);
        yCounts[result.type] = (yCounts[result.type] ?? 0) + 1;
        assert.deepEqual(evaluateYHand(cards.map(suitSwap), 1), result);
        assert.deepEqual(evaluateYHand([...cards].reverse(), 1), result);
        if (cards[0].rank === cards[2].rank && cards[0].rank !== cards[1].rank) {
            assert.equal(result.type, 'OnePair');
            assert.deepEqual(result.kickers, [cards[0].rank, cards[1].rank]);
            splitPairs++;
        }
        yHands++;
    }
}
assert.equal(yHands, 132600);
assert.equal(splitPairs, 7488);
// Twelve straight rank sets, two ordered orientations, and four suit choices.
assert.deepEqual(yCounts, {
    PureStraightFlush: 96, ThreeOfAKind: 312, StraightFlush: 192, PureStraight: 1440,
    Flush: 6576, PureOnePair: 14976, Straight: 2880, OnePair: 7488, HighCard: 98640,
});
const output = { generatedAt: new Date().toISOString(), xHands, xCounts, wheelFlushes,
    yHands, yCounts, splitPairs, suitRelabelChecks: yHands, rowReversalChecks: yHands,
    elapsedSeconds: (performance.now() - started) / 1000,
    limits: ['Category counts do not verify every X kicker.', 'Y suit rotation and row reversal do not imply arbitrary row-permutation invariance.', 'Evaluator validation is not full-game Nash convergence.'] };
writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
