import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ACHIEVEMENT_TYPES,
    buildAchievementCatalog,
    X_HAND_WIN_ACHIEVEMENT_TYPES,
    Y_HAND_WIN_ACHIEVEMENT_TYPES,
} from './achievements';

test('catalogs one win achievement for every X and Y hand', () => {
    assert.equal(X_HAND_WIN_ACHIEVEMENT_TYPES.length, 10);
    assert.equal(Y_HAND_WIN_ACHIEVEMENT_TYPES.length, 9);
    assert.equal(ACHIEVEMENT_TYPES.length, 22);
    assert.equal(new Set(ACHIEVEMENT_TYPES).size, ACHIEVEMENT_TYPES.length);
});

test('lists every achievement as locked when the player has none', () => {
    const rows = buildAchievementCatalog([]);

    assert.deepEqual(rows.map(row => row.type), ACHIEVEMENT_TYPES);
    assert.ok(rows.every(row => row.achievement === undefined));
});

test('marks stored achievements as unlocked and preserves future types', () => {
    const firstWin = { id: 'a-1', achievement_type: 'first_win', unlocked_at: '2026-09-03T00:00:00Z' };
    const future = { id: 'a-2', achievement_type: 'future_champion', unlocked_at: '2026-09-03T01:00:00Z' };
    const rows = buildAchievementCatalog([firstWin, future]);

    assert.equal(rows.find(row => row.type === 'first_win')?.achievement, firstWin);
    assert.equal(rows.find(row => row.type === 'win_streak_3')?.achievement, undefined);
    assert.equal(rows.at(-1)?.achievement, future);
});
