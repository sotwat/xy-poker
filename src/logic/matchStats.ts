export interface MatchPlayerStats {
    rating: number | null;
    aiRating: number | null;
    gamesPlayed: number | null;
    wins: number | null;
}

export function matchWinRate(stats: MatchPlayerStats | null): string {
    if (!stats || stats.gamesPlayed === null || stats.gamesPlayed <= 0 || stats.wins === null || stats.wins < 0 || stats.wins > stats.gamesPlayed) return 'N/A';
    return `${(stats.wins / stats.gamesPlayed * 100).toFixed(1)}%`;
}
