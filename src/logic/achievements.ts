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

export const ACHIEVEMENT_TYPES = [
    'first_win',
    'win_streak_3',
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
}

export function buildAchievementCatalog<T extends StoredAchievement>(
    achievements: readonly T[],
): AchievementCatalogRow<T>[] {
    const achievementsByType = new Map(
        achievements.map(achievement => [achievement.achievement_type, achievement]),
    );

    return [
        ...ACHIEVEMENT_TYPES.map(type => ({ type, achievement: achievementsByType.get(type) })),
        ...achievements
            .filter(achievement => !ACHIEVEMENT_TYPES.includes(achievement.achievement_type as typeof ACHIEVEMENT_TYPES[number]))
            .map(achievement => ({ type: achievement.achievement_type, achievement })),
    ];
}
