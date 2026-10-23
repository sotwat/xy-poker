export function createLocalGameStore({ now = Date.now, ttl = 2 * 60 * 60 * 1000, limit = 2000, perPlayer = 4 } = {}) {
    const games = new Map();
    const prune = () => {
        for (const [token, entry] of games) if (now() - entry.game.startedAt >= ttl) games.delete(token);
    };
    return {
        set(userId, game) {
            prune();
            const previous = [...games].filter(([, entry]) => entry.userId === userId);
            while (previous.length >= perPlayer) games.delete(previous.shift()[0]);
            while (games.size >= limit) games.delete(games.keys().next().value);
            games.set(game.token, { userId, game });
        },
        get(userId, token) {
            prune();
            const entry = games.get(token);
            return entry?.userId === userId ? entry.game : undefined;
        },
    };
}

export const localGameRetryDelay = (game, now = Date.now()) => Math.max(0, 30_000 - (now - game.startedAt));
