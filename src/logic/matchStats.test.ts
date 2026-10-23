import test from 'node:test';
import assert from 'node:assert/strict';
import { matchWinRate } from './matchStats.ts';

test('win rate uses total completed matches including draws in the denominator', () => {
 assert.equal(matchWinRate({ rating: 1500, aiRating: 1600, gamesPlayed: 8, wins: 5 }), '62.5%');
 assert.equal(matchWinRate({ rating: 0, aiRating: 0, gamesPlayed: 1, wins: 0 }), '0.0%');
});
test('zero matches and unavailable or invalid counts do not display a false win rate', () => {
 for (const stats of [null, { rating: 1500, aiRating: 1500, gamesPlayed: 0, wins: 0 }, { rating: 1500, aiRating: 1500, gamesPlayed: 10, wins: null }, { rating: 1500, aiRating: 1500, gamesPlayed: 10, wins: 11 }]) assert.equal(matchWinRate(stats), 'N/A');
});
