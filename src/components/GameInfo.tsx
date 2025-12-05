import React from 'react';
import type { GameState } from '../logic/types';
import './GameInfo.css';

interface GameInfoProps {
    gameState: GameState;
    isOnlineMode?: boolean;
    playerRole?: 'host' | 'guest' | null;
    playerName?: string;
    opponentName?: string;
}

export const GameInfo: React.FC<GameInfoProps> = ({
    gameState,
    isOnlineMode = false,
    playerRole = null,
    playerName = 'Player 1',
    opponentName = 'Player 2'
}) => {
    const { phase, currentPlayerIndex, players, winner } = gameState;

    // Determine display names based on player role in online mode
    const myIndex = isOnlineMode && playerRole === 'guest' ? 1 : 0;
    const myDisplayName = playerName;
    const oppDisplayName = opponentName;
    const p1Name = myIndex === 0 ? myDisplayName : oppDisplayName;
    const p2Name = myIndex === 1 ? myDisplayName : oppDisplayName;

    return (
        <div className="game-info">
            <div className="status-bar">
                {phase === 'playing' && (
                    isOnlineMode ? (
                        currentPlayerIndex === myIndex ? (
                            <div className="turn-indicator your-turn">
                                YOUR TURN
                            </div>
                        ) : (
                            <div className="turn-indicator opponent-turn">
                                {oppDisplayName}'s Turn
                            </div>
                        )
                    ) : (
                        <div className="turn-indicator">
                            Turn: {currentPlayerIndex === 0 ? p1Name : p2Name}
                        </div>
                    )
                )}
                {phase === 'ended' && (
                    <div className="winner-banner">
                        Winner: {winner === 'p1' ? p1Name : p2Name}!
                    </div>
                )}
                {phase === 'scoring' && (
                    <div className="scoring-banner">
                        Scoring Phase...
                    </div>
                )}
            </div>

            <div className="scores">
                <div className="score-row">
                    <span className={`score-item ${currentPlayerIndex === 0 ? 'active' : ''}`}>{p1Name}: {players[0].score}</span>
                    <span className={`score-item ${currentPlayerIndex === 1 ? 'active' : ''}`}>{p2Name}: {players[1].score}</span>
                </div>
                <div className="bonus-row">
                    <span className="bonus-item">Bonuses: {players[0].bonusesClaimed}</span>
                    <span className="bonus-item">Bonuses: {players[1].bonusesClaimed}</span>
                </div>
            </div>
        </div>
    );
};
