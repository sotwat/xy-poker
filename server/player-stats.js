const count = value => value !== null && value !== undefined && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

// Only these public statistics may cross the socket boundary.
export function publicPlayerStats(player) {
    if (!player) return null;
    const gamesPlayed = count(player.games_played);
    const wins = count(player.wins);
    return {
        rating: count(player.rating),
        aiRating: count(player.ai_rating),
        gamesPlayed,
        wins: gamesPlayed !== null && wins !== null && wins <= gamesPlayed ? wins : null,
    };
}
