import React from 'react';
import type { GameState } from '../logic/types';
import { DevBadge } from './DevBadge';
import './GameInfo.css';

interface GameInfoProps {
    gameState: GameState;
    isOnlineMode?: boolean;
    playerRole?: 'host' | 'guest' | null;
    playerName?: string;
    opponentName?: string;
    onSurrender?: () => void;
    isPremium?: boolean; // Prop named isPremium to match App.tsx usage
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
    const { phase, currentPlayerIndex, players, winner, turnCount } = gameState; // Added turnCount/deck if needed or just use what's there

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
                <div className="turn-info">
                    Turn: <span className="highlight">{turnCount}</span>
                    <span className="phase-badge">{phase.toUpperCase()}</span>
                </div>
                {/* Room ID is not passed in props but was in my previous edit? 
                    Wait, previous edit used {roomId}. 
                    Props has {roomId}? No, interface above DOES NOT have roomId.
                    But App.tsx might pass it?
                    The view Step 1332 showed <GameInfo ... />
                    It did NOT show roomId being passed!
                    So GameInfo doesn't receive roomId.
                    My previous "botched" edit added roomId to props. 
                    I should Stick to the interface I see in Step 1319 (original file).
                    Step 1319 lines 6-14:
                    interface GameInfoProps { ... no roomId ... }
                    Wait, Step 1319 lines 6-14:
                    interface GameInfoProps {
                        gameState: GameState;
                        isOnlineMode?: boolean;
                        playerRole?: ...
                        playerName?: ...
                        opponentName?: ...
                        onSurrender?: ...
                        isPremium?: ...
                    }
                    There is no roomId.
                    So I should remove roomId from my rewrite to match App.tsx.
                */}
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
                        {/* Use isPremium prop for MYSELF (if I am p1), and p1.isDeveloper for others/state */}
                        {p1Name} {((myIndex === 0 && isPremium) || p1.isDeveloper) && <DevBadge />}: {p1.score}
                    </span>
                    <span className="bonus-item">Bonuses: {p1.bonusesClaimed}</span>
                </div>
                <div className="player-score-row player-2">
                    <span className={`score-item ${currentPlayerIndex === 1 ? 'active' : ''}`}>
                        {p2Name} {((myIndex === 1 && isPremium) || p2.isDeveloper) && <DevBadge />}: {p2.score}
                    </span>
                    <span className="bonus-item">Bonuses: {p2.bonusesClaimed}</span>
                </div>
            </div>
        </div>
    );
};
