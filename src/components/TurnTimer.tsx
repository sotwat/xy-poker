import React from 'react';
import './TurnTimer.css';
import { useI18n } from '../i18n';

interface TurnTimerProps {
    timeLeft: number;
    currentPlayerIndex: number; // 0 for P1 (Blue), 1 for P2 (Red)
    isMyTurn: boolean;
    isPaused?: boolean;
    onResync?: () => void;
}

export const TurnTimer: React.FC<TurnTimerProps> = ({ timeLeft, currentPlayerIndex, isMyTurn, isPaused = false, onResync }) => {
    const { t } = useI18n();

    return (
        <div className={`turn-timer timer-player-${currentPlayerIndex + 1} ${!isPaused && timeLeft <= 10 ? 'warning' : ''} ${isPaused ? 'paused' : ''}`}>
            <div className="timer-track" aria-hidden="true"><span style={{ transform: `scaleX(${Math.max(0, Math.min(1, timeLeft / 60))})` }} /></div>
            <div className="timer-label">
                {isPaused ? t('timer.thoughtPaused') : (isMyTurn ? t('timer.yourTurn') : t('timer.opponentTurn'))}
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
            <div className="timer-value" aria-live={!isPaused && timeLeft <= 10 ? 'polite' : 'off'}>{timeLeft}<small>s</small></div>
        </div>
    );
};
