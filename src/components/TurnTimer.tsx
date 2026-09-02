import React from 'react';
import './TurnTimer.css';
import { useI18n } from '../i18n';

interface TurnTimerProps {
    timeLeft: number;
    currentPlayerIndex: number; // 0 for P1 (Blue), 1 for P2 (Red)
    isMyTurn: boolean;
    onResync?: () => void;
}

export const TurnTimer: React.FC<TurnTimerProps> = ({ timeLeft, currentPlayerIndex, isMyTurn, onResync }) => {
    const { t } = useI18n();
    const borderColor = currentPlayerIndex === 0 ? '#4da8da' : '#ff4d4d'; // Blue : Red

    return (
        <div className={`turn-timer ${timeLeft <= 10 ? 'warning' : ''}`} style={{ borderColor }}>
            <div className="timer-label">
                {isMyTurn ? t('timer.yourTurn') : t('timer.opponentTurn')}
                {!isMyTurn && onResync && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onResync(); }}
                        className="resync-btn"
                        title={t('timer.sync')}
                    >
                        ↻
                    </button>
                )}
            </div>
            <div className="timer-value">{timeLeft}s</div>
        </div>
    );
};
