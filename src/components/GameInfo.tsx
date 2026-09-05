import React from 'react';
import type { GameState } from '../logic/types';
import { PremiumBadge } from './PremiumBadge';
import { AnimatedScore } from './AnimatedScore';
import './GameInfo.css';
import { useI18n } from '../i18n';

interface GameInfoProps {
    gameState: GameState;
    isOnlineMode?: boolean;
    playerRole?: 'host' | 'guest' | null;
    playerName?: string;
    opponentName?: string;
    onSurrender?: () => void;
    isPremium?: boolean; // Prop named isPremium to match App.tsx usage
    isAutoPlay?: boolean;
    onToggleAuto?: () => void;
}

export const GameInfo: React.FC<GameInfoProps> = ({
    gameState,
    isOnlineMode = false,
    playerRole = null,
    playerName = 'Player 1',
    opponentName = 'Player 2',
    onSurrender,
    isPremium = false,
    isAutoPlay = false,
    onToggleAuto
}) => {
    const { t } = useI18n();
    const { phase, currentPlayerIndex, players, winner } = gameState; // Added turnCount/deck if needed or just use what's there

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
                {/* Room ID display logic removed as props don't support it */}

                {phase === 'playing' && (
                    currentPlayerIndex === (isOnlineMode ? myIndex : 0) ? (
                        <div className="turn-indicator your-turn">
                            {isAutoPlay ? t('gameInfo.aiPlaying') : t('gameInfo.yourTurn')}
                        </div>
                    ) : (
                        <div className="turn-indicator opponent-turn">
                            {t('gameInfo.opponentTurn', { name: isOnlineMode ? oppDisplayName : p2Name })}
                        </div>
                    )
                )}
                {isPremium && onToggleAuto && (phase === 'turn_selection' || phase === 'playing') && (
                    <button
                        type="button"
                        className={`auto-toggle-btn ${isAutoPlay ? 'active' : ''}`}
                        onClick={onToggleAuto}
                        aria-pressed={isAutoPlay}
                        aria-label={t('gameInfo.autoAria', { state: isAutoPlay ? t('gameInfo.on') : t('gameInfo.off') })}
                        title={t('gameInfo.autoTitle')}
                    >
                        AUTO {isAutoPlay ? t('gameInfo.on').toUpperCase() : t('gameInfo.off').toUpperCase()}
                    </button>
                )}
                {phase === 'playing' && onSurrender && (
                    <button type="button" className="surrender-btn" onClick={onSurrender}>
                        {t('gameInfo.surrender')}
                    </button>
                )}
                {phase === 'ended' && (
                    <div className="winner-banner">
                        {winner === 'draw' ? (
                            t('gameInfo.tie')
                        ) : (
                            t('gameInfo.winner', { name: winner === 'p1' ? p1Name : p2Name })
                        )}
                    </div>
                )}
                {phase === 'scoring' && (
                    <div className="scoring-banner">
                        {t('gameInfo.scoring')}
                    </div>
                )}
            </div>

            <div className="scores">
                <div className="player-score-row player-1">
                    <div className={`score-item ${currentPlayerIndex === 0 ? 'active' : ''}`}>
                        <span className="score-player-name"><i aria-hidden="true" />{p1Name} {((myIndex === 0 && isPremium) || p1.isPremium) && <PremiumBadge />}</span>
                        <span className="score-total"><AnimatedScore value={p1.score} className="score-number" /><small>pt</small></span>
                    </div>
                    <span className="bonus-item">{t('gameInfo.bonus', { count: p1.bonusesClaimed })}</span>
                </div>
                <div className="player-score-row player-2">
                    <div className={`score-item ${currentPlayerIndex === 1 ? 'active' : ''}`}>
                        <span className="score-player-name"><i aria-hidden="true" />{p2Name} {((myIndex === 1 && isPremium) || p2.isPremium) && <PremiumBadge />}</span>
                        <span className="score-total"><AnimatedScore value={p2.score} className="score-number" /><small>pt</small></span>
                    </div>
                    <span className="bonus-item">{t('gameInfo.bonus', { count: p2.bonusesClaimed })}</span>
                </div>
            </div>
        </div >
    );
};
