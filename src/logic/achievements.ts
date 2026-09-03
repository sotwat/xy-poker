export const ACHIEVEMENT_TYPES = [
    'first_win',
    'win_streak_3',
    'straight_flush_x',
    'perfect_game',
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
