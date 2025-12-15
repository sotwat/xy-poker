import React from 'react';
import type { GameState } from '../logic/types';
import './GameInfo.css';

interface GameInfoProps {
    gameState: GameState;
    isOnlineMode?: boolean;
    playerRole?: 'host' | 'guest' | null;
    playerName?: string;
    opponentName?: string;
    onSurrender?: () => void;
    isPremium?: boolean;
}

export const GameInfo: React.FC<GameInfoProps> = ({
    gameState,
    isOnlineMode = false,
    playerRole = null,
    playerName = 'Player 1',
    opponentName = 'Player 2',
    onSurrender,
    isPremium = false
}) => {
    const { phase, currentPlayerIndex, players, winner } = gameState;

    // Determine display names based on player role in online mode
    const myIndex = isOnlineMode && playerRole === 'guest' ? 1 : 0;
    const myDisplayName = playerName;
    const oppDisplayName = opponentName;
    const p1Name = myIndex === 0 ? myDisplayName : oppDisplayName;
    const p2Name = myIndex === 1 ? myDisplayName : oppDisplayName;

    const p1 = players[0];
    const p2 = players[1];


    return (
        <div className="game-info" data-my-index={isOnlineMode ? myIndex : 0}>
            <div className="status-bar">
                {phase === 'playing' && (
                    currentPlayerIndex === (isOnlineMode ? myIndex : 0) ? (
                        <>
                            <div className="turn-indicator your-turn">
                                YOUR TURN
                            </div>
                            {onSurrender && (
                                <button className="surrender-btn" onClick={onSurrender}>
                                    Cancel
                                </button>
                            )}
                        </>
                    ) : (
                        <div className="turn-indicator opponent-turn">
                            {isOnlineMode ? `${oppDisplayName}'s Turn` : `${p2Name}'s Turn`}
                        </div>
                    )
                )}
                {phase === 'ended' && (
                    <div className="winner-banner">
                        {winner === 'draw' ? (
                            'Draw - Tie Game!'
                        ) : (
                            `Winner: ${winner === 'p1' ? p1Name : p2Name}!`
                        )}
                    </div>
                )}
                {phase === 'scoring' && (
                    <div className="scoring-banner">
                        Scoring Phase...
                    </div>
                )}
            </div>

            <div className="scores">
                <div className="player-score-row player-1">
                    <span className={`score-item ${currentPlayerIndex === 0 ? 'active' : ''}`}>
                        {p1Name} {((myIndex === 0 && isPremium) || p1.isPremium) && <span title="Premium Member">💎</span>}: {p1.score}
                    </span>
                    <span className="bonus-item">Bonuses: {p1.bonusesClaimed}</span>
                </div>
                <div className="player-score-row player-2">
                    <span className={`score-item ${currentPlayerIndex === 1 ? 'active' : ''}`}>
                        {p2Name} {((myIndex === 1 && isPremium) || p2.isPremium) && <span title="Premium Member">💎</span>}: {p2.score}
                    </span>
                    <span className="bonus-item">Bonuses: {p2.bonusesClaimed}</span>
                </div>
            </div>
        </div>
    );
};
