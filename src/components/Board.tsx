import React from 'react';
import type { Card as CardType } from '../logic/types';
import { Card } from './Card';
import { Dice } from './Dice';
import './Board.css';

interface BoardProps {
    board: (CardType | null)[][]; // 3 rows x 5 cols
    dice: number[];
    onColumnClick: (colIndex: number) => void;
    isCurrentPlayer: boolean;
}

export const Board: React.FC<BoardProps> = ({ board, dice, onColumnClick, isCurrentPlayer }) => {
    // Transpose board for column-based rendering if needed, but grid is easier.
    // We want to render columns so we can click them.
    // Let's render 5 columns.

    const columns = Array.from({ length: 5 }, (_, colIndex) => {
        const cardsInCol = [board[0][colIndex], board[1][colIndex], board[2][colIndex]];
        return (
            <div
                key={colIndex}
                className={`board-column ${isCurrentPlayer ? 'interactive' : ''}`}
                onClick={() => isCurrentPlayer && onColumnClick(colIndex)}
            >
                <div className="dice-header">
                    <Dice value={dice[colIndex]} />
                </div>
                <div className="card-slots">
                    {cardsInCol.map((card, rowIndex) => (
                        <div key={rowIndex} className="card-slot">
                            {card ? <Card card={card} /> : <div className="empty-slot" />}
                        </div>
                    ))}
                </div>
            </div>
        );
    });

    return (
        <div className="board">
            {columns}
        </div>
    );
};
