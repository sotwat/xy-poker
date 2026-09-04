import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ACHIEVEMENT_TYPES,
    buildAchievementCatalog,
    PROGRESS_ACHIEVEMENT_TYPES,
    X_HAND_WIN_ACHIEVEMENT_TYPES,
    Y_HAND_WIN_ACHIEVEMENT_TYPES,
} from './achievements';

test('catalogs one win achievement for every X and Y hand', () => {
    assert.equal(X_HAND_WIN_ACHIEVEMENT_TYPES.length, 10);
    assert.equal(Y_HAND_WIN_ACHIEVEMENT_TYPES.length, 9);
    assert.equal(PROGRESS_ACHIEVEMENT_TYPES.length, 10);
    assert.equal(ACHIEVEMENT_TYPES.length, 39);
    assert.equal(new Set(ACHIEVEMENT_TYPES).size, ACHIEVEMENT_TYPES.length);
});

test('shows bounded live progress for cumulative and winning-streak achievements', () => {
    const rows = buildAchievementCatalog([], {
        gamesPlayed: 74,
        wins: 12,
        currentWinStreak: 4,
    });

    assert.deepEqual(rows.find(row => row.type === 'games_50')?.progress, {
        metric: 'gamesPlayed', target: 50, current: 50,
    });
    assert.deepEqual(rows.find(row => row.type === 'games_100')?.progress, {
        metric: 'gamesPlayed', target: 100, current: 74,
    });
    assert.deepEqual(rows.find(row => row.type === 'wins_50')?.progress, {
        metric: 'wins', target: 50, current: 12,
    });
    assert.deepEqual(rows.find(row => row.type === 'win_streak_5')?.progress, {
        metric: 'currentWinStreak', target: 5, current: 4,
    });
});

test('keeps an unlocked progress achievement visually complete after the current streak resets', () => {
    const unlocked = { id: 'a-3', achievement_type: 'win_streak_3', unlocked_at: '2026-09-04T00:00:00Z' };
    const row = buildAchievementCatalog([unlocked], {
        gamesPlayed: 8,
        wins: 3,
        currentWinStreak: 0,
    }).find(candidate => candidate.type === 'win_streak_3');

    assert.equal(row?.achievement, unlocked);
    assert.deepEqual(row?.progress, { metric: 'currentWinStreak', target: 3, current: 3 });
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
