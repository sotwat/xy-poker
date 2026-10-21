import catalog from './progressionCatalog.json';
import { ACHIEVEMENT_TYPES } from './achievements';
export const COSMETICS = catalog;
export const TITLES = catalog.filter(c => c.kind === 'title');
export const qualifies = (item: typeof catalog[number], level: number, achievements: readonly string[]) =>
    item.level !== null ? level >= item.level : achievements.includes(item.achievement!);
export const unlockedCosmetics = (level: number, achievements: readonly string[]) => catalog.filter(c => qualifies(c, level, achievements));
export const earnedSkin = (kind: string, id: string) => catalog.find(c => c.kind === kind && c.id === id);
export function levelReward(previous: number, next: number) {
    return 25 * (next * (next + 1) - previous * (previous + 1))
        + 200 * (Math.floor(next / 5) - Math.floor(previous / 5));
}
export function achievementReward(type: string) {
    if (!(ACHIEVEMENT_TYPES as readonly string[]).includes(type)) return { coins: 0, xp: 0 };
    const special: Record<string, number> = {
        games_10: 100, games_50: 250, games_100: 500, games_500: 1500,
        wins_10: 150, wins_50: 400, wins_100: 800,
        win_streak_3: 100, win_streak_5: 250, win_streak_10: 750,
        perfect_game: 500, y_sweep: 250, x_win_royal_flush: 500,
        straight_flush_x: 250, y_win_pure_straight_flush: 250,
    };
    const coins = special[type] ?? 50;
    return { coins, xp: coins * 2 };
}

export function cosmeticCondition(item: typeof COSMETICS[number]) {
    const conditions: Record<string, string> = {
        win_streak_5: '5 WIN STREAK', perfect_game: 'ALL HANDS WON', games_100: '100 MATCHES',
        first_win: 'FIRST WIN', x_win_royal_flush: 'X · ROYAL FLUSH',
    };
    return item.level ? `LV ${item.level}` : conditions[item.achievement!] ?? item.achievement!;
}
