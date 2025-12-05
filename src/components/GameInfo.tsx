import React from 'react';
import type { GameState } from '../logic/types';
import './GameInfo.css';

interface GameInfoProps {
    gameState: GameState;
    isOnlineMode?: boolean;
    playerRole?: 'host' | 'guest' | null;
}

export const GameInfo: React.FC<GameInfoProps> = ({ gameState, isOnlineMode = false, playerRole = null }) => {
    const { phase, currentPlayerIndex, players, winner } = gameState;

    return (
        <div className="game-info">
            <div className="status-bar">
                {phase === 'playing' && (
                    <div className="turn-indicator">
                        {isOnlineMode ? (
                            currentPlayerIndex === (playerRole === 'guest' ? 1 : 0)
                                ? '▶ Your Turn'
                                : 'Opponent\'s Turn'
                        ) : (
                            `Turn: Player ${currentPlayerIndex + 1}`
                        )}
                    </div>
                )}
                {phase === 'ended' && (
                    <div className="winner-banner">
                        Winner: {winner === 'p1' ? 'Player 1' : 'Player 2'}!
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
                    <span className={`score-item ${currentPlayerIndex === 0 ? 'active' : ''}`}>P1 Score: {players[0].score}</span>
                    <span className={`score-item ${currentPlayerIndex === 1 ? 'active' : ''}`}>P2 Score: {players[1].score}</span>
                </div>
                <div className="bonus-row">
                    <span className="bonus-item">Bonuses: {players[0].bonusesClaimed}</span>
                    <span className="bonus-item">Bonuses: {players[1].bonusesClaimed}</span>
                </div>
            </div>
        </div>
    );
};
