import React from 'react';
import './TurnTimer.css';

interface TurnTimerProps {
    timeLeft: number;
    currentPlayerIndex: number; // 0 for P1 (Blue), 1 for P2 (Red)
    isMyTurn: boolean;
    onResync?: () => void;
}

export const TurnTimer: React.FC<TurnTimerProps> = ({ timeLeft, currentPlayerIndex, isMyTurn, onResync }) => {
    const borderColor = currentPlayerIndex === 0 ? '#4da8da' : '#ff4d4d'; // Blue : Red

    return (
        <div className={`turn-timer ${timeLeft <= 10 ? 'warning' : ''}`} style={{ borderColor }}>
            <div className="timer-label">
                {isMyTurn ? "Your Turn" : "Opponent's Turn"}
                {!isMyTurn && onResync && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onResync(); }}
                        className="resync-btn"
                        title="Sync Game State"
                    >
                        ↻
                    </button>
                )}
            </div>
            <div className="timer-value">{timeLeft}s</div>
        </div>
    );
};
