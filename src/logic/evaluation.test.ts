import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeck, SUITS } from './deck';
import { evaluateXHand, evaluateYHand } from './evaluation';
import { calculateXHandScores } from './scoring';

test('wheel straight flush is five-high in every suit and loses the same-type bonus', () => {
    const deck = createDeck();
    for (const suit of SUITS) {
        const hand = (ranks: number[]) => ranks.map(rank => deck.find(card => card.suit === suit && card.rank === rank)!);
        const wheel = evaluateXHand(hand([14, 2, 3, 4, 5]));
        assert.equal(wheel.type, 'StraightFlush');
        assert.deepEqual(wheel.kickers, [5]);
        for (let high = 6; high <= 13; high++) {
            const higher = evaluateXHand(hand(Array.from({ length: 5 }, (_, i) => high - 4 + i)));
            assert.deepEqual(calculateXHandScores(wheel, higher), { p1Score: 16, p2Score: 17 });
            assert.deepEqual(calculateXHandScores(higher, wheel), { p1Score: 17, p2Score: 16 });
        }
        assert.deepEqual(calculateXHandScores(wheel, wheel), { p1Score: 16, p2Score: 16 });
    }
});

test('split Y pairs compare the repeated rank before the middle kicker', () => {
    const deck = createDeck();
    for (let pair = 2; pair <= 14; pair++) for (let kicker = 2; kicker <= 14; kicker++) {
        if (pair === kicker) continue;
        const cards = [deck.find(c => c.suit === 'hearts' && c.rank === pair)!,
            deck.find(c => c.suit === 'clubs' && c.rank === kicker)!,
            deck.find(c => c.suit === 'spades' && c.rank === pair)!];
        const result = evaluateYHand(cards, 3);
        assert.equal(result.type, 'OnePair');
        assert.deepEqual(result.kickers, [pair, kicker]);
    }
});
