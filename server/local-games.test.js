import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalGameStore, localGameRetryDelay } from './local-games.js';

test('local AI deal survives socket replacement but remains bound to the authenticated player', () => {
    let now = 1000;
    const store = createLocalGameStore({ now: () => now });
    const game = { token: 'deal', startedAt: now, aiRecorded: false };
    store.set('alice', game);
    assert.equal(store.get('alice', 'deal'), game);
    assert.equal(store.get('bob', 'deal'), undefined);
    store.get('alice', 'deal').aiRecorded = true;
    assert.equal(store.get('alice', 'deal').aiRecorded, true);
    now += 2 * 60 * 60 * 1000;
    assert.equal(store.get('alice', 'deal'), undefined);
});

test('abandoned deals are bounded without evicting another player below the global limit', () => {
    const store = createLocalGameStore({ now: () => 1000, perPlayer: 2, limit: 3 });
    const add = (user, token) => store.set(user, { token, startedAt: 1000 });
    add('bob', 'b'); add('alice', 'a1'); add('alice', 'a2'); add('alice', 'a3');
    assert.equal(store.get('alice', 'a1'), undefined);
    assert.ok(store.get('bob', 'b'));
    assert.ok(store.get('alice', 'a2'));
    add('charlie', 'c');
    assert.equal(store.get('bob', 'b'), undefined);
});

test('fast legitimate matches receive a finite wait instead of an invalid-session failure', () => {
    assert.equal(localGameRetryDelay({ startedAt: 1000 }, 11000), 20000);
    assert.equal(localGameRetryDelay({ startedAt: 1000 }, 31000), 0);
    assert.equal(localGameRetryDelay({ startedAt: 1000 }, 50000), 0);
});
