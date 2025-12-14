import { supabase } from '../supabase';

// XP Constants
// const XP_WIN = 100; // Deprecated: Now based on score
// const XP_LOSS = 20;
// const XP_DRAW = 50;

/**
 * Updates player gamification stats (XP, Level, Games Played, Wins, Coins).
 * Should be called at the end of a game.
 */
export async function updatePlayerStats(
    playerId: string,
    result: 'win' | 'loss' | 'draw',
    score: number // Added score parameter
) {
    if (!playerId) return;

    // 1. Fetch current stats
    const { data: player, error } = await supabase
        .from('players')
        .select('xp, level, games_played, wins, coins')
        .eq('id', playerId)
        .single();

    if (error || !player) {
        console.error('Error fetching player for stats update:', error);
        return;
    }

    // 2. Calculate New Values
    // XP and Coins increase by the Score obtained
    // Ensure score is positive for rewards (though game score allows negative, usually we reward raw performance or floored at 0)
    const rewardValue = Math.max(0, Math.floor(score));

    const newXp = (player.xp || 0) + rewardValue;
    const newCoins = (player.coins || 0) + rewardValue;

    const newGames = (player.games_played || 0) + 1;
    const newWins = (player.wins || 0) + (result === 'win' ? 1 : 0);

    // Simple Level Formula: Level N requires roughly N*100 XP cumulative (linearish for now)
    const currentLevel = player.level || 1;
    const nextLevelXp = currentLevel * 100 + (currentLevel ** 2) * 50;

    let newLevel = currentLevel;
    if (newXp >= nextLevelXp) {
        newLevel++;
    }

    // 3. Update DB
    await supabase
        .from('players')
        .update({
            xp: newXp,
            level: newLevel,
            games_played: newGames,
            wins: newWins,
            coins: newCoins
        })
        .eq('id', playerId);

    return { newLevel, leveledUp: newLevel > currentLevel, coinsEarned: rewardValue };
}

/**
 * Checks and unlocks achievements based on game state.
 */
export async function checkAchievements(playerId: string, _gameState: any, result: 'win' | 'loss' | 'draw') {
    if (!playerId) return;

    const newUnlocks: string[] = [];

    // list of potential achievements to check
    const checks = [
        {
            id: 'first_win',
            condition: () => result === 'win'
        },
        // Add more complex checks here analyzing 'gameState.board' etc.
    ];

    for (const check of checks) {
        if (check.condition()) {
            // Try insert. If unique constraint fails, they already have it.
            const { error } = await supabase
                .from('achievements')
                .insert({
                    player_id: playerId,
                    achievement_type: check.id
                });

            if (!error) {
                newUnlocks.push(check.id);
            }
        }
    }

    return newUnlocks;
}
