import React from 'react';
import './TurnTimer.css';

interface TurnTimerProps {
    timeLeft: number;
    totalTime: number;
    currentPlayerIndex: number; // 0 for P1 (Blue), 1 for P2 (Red)
    isMyTurn: boolean;
}

export const TurnTimer: React.FC<TurnTimerProps> = ({ timeLeft, currentPlayerIndex, isMyTurn }) => {
    // Calculate percentage for visual bar (optional) or just text
    // Requirement: "Always visible", "Border of own color"

    const borderColor = currentPlayerIndex === 0 ? '#4da8da' : '#ff4d4d'; // Blue : Red

    return (
        <div className={`turn-timer ${timeLeft <= 10 ? 'warning' : ''}`} style={{ borderColor }}>
            <div className="timer-label">{isMyTurn ? "Your Turn" : "Opponent's Turn"}</div>
            <div className="timer-value">{timeLeft}s</div>
        </div>
    );
};
