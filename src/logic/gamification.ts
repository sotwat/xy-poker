import { socket } from './online';

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
    gameToken: string,
) {
    if (!playerId) return;
    type StatsUpdateResponse = {
        success: boolean;
        error?: string;
        newLevel?: number;
        leveledUp?: boolean;
        coinsEarned?: number;
    };

    return new Promise<StatsUpdateResponse>((resolve) => {
        const timeout = window.setTimeout(() => {
            resolve({ success: false, error: 'Stats update timed out' });
        }, 3000);

        socket.emit('update_player_stats', {
            userId: playerId,
            result,
            gameToken,
        }, (response: StatsUpdateResponse) => {
            window.clearTimeout(timeout);
            resolve(response);
        });
    });
}
