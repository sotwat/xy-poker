import React from 'react';
import type { Card as CardType } from '../logic/types';
import { Card } from './Card';
import { Dice } from './Dice';
import './SharedBoard.css';

interface SharedBoardProps {
    playerBoard: (CardType | null)[][];
    opponentBoard: (CardType | null)[][];
    dice: number[];
    onColumnClick: (colIndex: number) => void;
    isCurrentPlayer: boolean;
    revealHidden?: boolean;
}

export const SharedBoard: React.FC<SharedBoardProps> = ({
    playerBoard,
    opponentBoard,
    dice,
    onColumnClick,
    isCurrentPlayer,
    revealHidden = false
}) => {
    // Render 5 columns
    const columns = Array.from({ length: 5 }, (_, colIndex) => {
        // Opponent Rows: 2 (Top), 1, 0 (Bottom near dice)
        // Player Rows: 0 (Top near dice), 1, 2 (Bottom)

        const opponentCards = [opponentBoard[2][colIndex], opponentBoard[1][colIndex], opponentBoard[0][colIndex]];
        const playerCards = [playerBoard[0][colIndex], playerBoard[1][colIndex], playerBoard[2][colIndex]];

        return (
            <div
                key={colIndex}
                className={`shared-column ${isCurrentPlayer ? 'interactive' : ''}`}
                onClick={() => isCurrentPlayer && onColumnClick(colIndex)}
            >
                {/* Opponent Side */}
                <div className="opponent-slots">
                    {opponentCards.map((card, idx) => (
                        <div key={`opp-${idx}`} className="card-slot opponent-slot">
                            {card ? <Card card={revealHidden ? { ...card, isHidden: false } : card} /> : <div className="empty-slot" />}
                        </div>
                    ))}
                </div>

                {/* Central Dice */}
                <div className="dice-row">
                    <Dice value={dice[colIndex]} />
                </div>

                {/* Player Side */}
                <div className="player-slots">
                    {playerCards.map((card, idx) => (
                        <div key={`pl-${idx}`} className="card-slot player-slot">
                            {card ? <Card card={revealHidden ? { ...card, isHidden: false } : card} /> : <div className="empty-slot" />}
                        </div>
                    ))}
                </div>
            </div>
        );
    });

    return (
        <div className="shared-board">
            {columns}
        </div>
    );
};
