export const xpThreshold = (level: number) => level * 100 + level * level * 50;
export function resultXpProgress(xp: number, minimumLevel: number, maximumLevel: number) {
    let level = minimumLevel;
    while (level < maximumLevel && xp >= xpThreshold(level)) level++;
    const floor = level === 1 ? 0 : xpThreshold(level - 1);
    const ceiling = xpThreshold(level);
    return { level, fraction: Math.max(0, Math.min(1, (xp - floor) / (ceiling - floor))) };
}
