import test from 'node:test';
import assert from 'node:assert/strict';
import { publicPlayerStats } from './player-stats.js';

test('match stats expose only saved public counts and both rating pools', () => {
    assert.deepEqual(publicPlayerStats({ rating: 0, ai_rating: 1620, games_played: 20, wins: 13, id: 'private', browser_id: 'private', coins: 300 }), { rating: 0, aiRating: 1620, gamesPlayed: 20, wins: 13 });
});
test('missing and contradictory stats are unavailable, not fabricated defaults', () => {
    assert.equal(publicPlayerStats(null), null);
    assert.deepEqual(publicPlayerStats({ wins: 4, games_played: 2, rating: -1 }), { rating: null, aiRating: null, gamesPlayed: 2, wins: null });
    assert.deepEqual(publicPlayerStats({}), { rating: null, aiRating: null, gamesPlayed: null, wins: null });
});
