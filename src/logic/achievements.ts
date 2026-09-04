export const X_HAND_WIN_ACHIEVEMENT_TYPES = [
    'x_win_royal_flush',
    'straight_flush_x',
    'x_win_four_of_a_kind',
    'x_win_full_house',
    'x_win_straight',
    'x_win_flush',
    'x_win_three_of_a_kind',
    'x_win_two_pair',
    'x_win_one_pair',
    'x_win_high_card',
] as const;

export const Y_HAND_WIN_ACHIEVEMENT_TYPES = [
    'y_win_pure_straight_flush',
    'y_win_three_of_a_kind',
    'y_win_straight_flush',
    'y_win_pure_straight',
    'y_win_flush',
    'y_win_pure_one_pair',
    'y_win_straight',
    'y_win_one_pair',
    'y_win_high_card',
] as const;

export const PROGRESS_ACHIEVEMENT_TYPES = [
    'games_10',
    'games_50',
    'games_100',
    'games_500',
    'wins_10',
    'wins_50',
    'wins_100',
    'win_streak_3',
    'win_streak_5',
    'win_streak_10',
] as const;

export const ACHIEVEMENT_TYPES = [
    'first_win',
    'games_10',
    'games_50',
    'games_100',
    'games_500',
    'wins_10',
    'wins_50',
    'wins_100',
    'win_streak_3',
    'win_streak_5',
    'win_streak_10',
    'first_draw',
    'close_win',
    'score_30',
    'bonus_3',
    'bonus_5',
    'no_bonus_win',
    'hidden_three_win',
    'y_sweep',
    'perfect_game',
    ...X_HAND_WIN_ACHIEVEMENT_TYPES,
    ...Y_HAND_WIN_ACHIEVEMENT_TYPES,
] as const;

export interface StoredAchievement {
    achievement_type: string;
}

export interface AchievementCatalogRow<T extends StoredAchievement> {
    type: string;
    achievement?: T;
    progress?: AchievementProgress;
}

export interface AchievementProgressStats {
    gamesPlayed: number;
    wins: number;
    currentWinStreak: number;
}

export interface AchievementProgress {
    current: number;
    target: number;
    metric: keyof AchievementProgressStats;
}

const PROGRESS_DEFINITIONS: Record<typeof PROGRESS_ACHIEVEMENT_TYPES[number], {
    metric: keyof AchievementProgressStats;
    target: number;
}> = {
    games_10: { metric: 'gamesPlayed', target: 10 },
    games_50: { metric: 'gamesPlayed', target: 50 },
    games_100: { metric: 'gamesPlayed', target: 100 },
    games_500: { metric: 'gamesPlayed', target: 500 },
    wins_10: { metric: 'wins', target: 10 },
    wins_50: { metric: 'wins', target: 50 },
    wins_100: { metric: 'wins', target: 100 },
    win_streak_3: { metric: 'currentWinStreak', target: 3 },
    win_streak_5: { metric: 'currentWinStreak', target: 5 },
    win_streak_10: { metric: 'currentWinStreak', target: 10 },
};

export function buildAchievementCatalog<T extends StoredAchievement>(
    achievements: readonly T[],
    stats: AchievementProgressStats = { gamesPlayed: 0, wins: 0, currentWinStreak: 0 },
): AchievementCatalogRow<T>[] {
    const achievementsByType = new Map(
        achievements.map(achievement => [achievement.achievement_type, achievement]),
    );

    return [
        ...ACHIEVEMENT_TYPES.map(type => {
            const achievement = achievementsByType.get(type);
            const definition = PROGRESS_DEFINITIONS[type as typeof PROGRESS_ACHIEVEMENT_TYPES[number]];
            const progress = definition ? {
                ...definition,
                current: achievement
                    ? definition.target
                    : Math.min(definition.target, Math.max(0, stats[definition.metric])),
            } : undefined;
            return { type, achievement, progress };
        }),
        ...achievements
            .filter(achievement => !ACHIEVEMENT_TYPES.includes(achievement.achievement_type as typeof ACHIEVEMENT_TYPES[number]))
            .map(achievement => ({ type: achievement.achievement_type, achievement })),
    ];
}
