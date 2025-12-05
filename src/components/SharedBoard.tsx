import React, { useState } from 'react';
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
    revealAll?: boolean; // For post-game view
    winningColumns?: ('p1' | 'p2' | 'draw')[];
    xWinner?: 'p1' | 'p2' | 'draw'; // X-hand winner for row highlighting
}

export const SharedBoard: React.FC<SharedBoardProps> = ({
    playerBoard,
    opponentBoard,
    dice,
    onColumnClick,
    isCurrentPlayer,
    revealAll = false,
    winningColumns,
    xWinner
}) => {
    const [peekingCard, setPeekingCard] = useState<string | null>(null);
    const [pressTimer, setPressTimer] = useState<number | null>(null);

    const handleCardPressStart = (card: CardType | null, _colIndex: number, isPlayerCard: boolean) => {
        if (!card) return;

        // Clear any existing timer
        if (pressTimer !== null) {
            clearTimeout(pressTimer);
            setPressTimer(null);
        }

        // If it's own hidden card, start long press timer
        if (isPlayerCard && card.isHidden && !revealAll) {
            const timer = window.setTimeout(() => {
                setPeekingCard(card.id);
            }, 500); // 500ms long press
            setPressTimer(timer);
        }
    };

    const handleCardPressEnd = (card: CardType | null, colIndex: number, _isPlayerCard: boolean) => {
        // Clear timer if released before long press completes
        if (pressTimer !== null) {
            clearTimeout(pressTimer);
            setPressTimer(null);
        }

        // Hide peek when released
        setPeekingCard(null);

        // If it was a quick press (not long press) and conditions are met, trigger column click
        if (!card && isCurrentPlayer) {
            onColumnClick(colIndex);
        }
    };

    const handleCardClick = (card: CardType | null, colIndex: number, isPlayerCard: boolean) => {
        // For non-hidden cards or opponent cards, just handle column click
        if (card && (!card.isHidden || !isPlayerCard) && isCurrentPlayer) {
            onColumnClick(colIndex);
        }
    };

    // Render 5 columns
    const columns = Array.from({ length: 5 }, (_, colIndex) => {
        // Opponent Rows: 2 (Top), 1, 0 (Bottom near dice)
        // Player Rows: 0 (Top near dice), 1, 2 (Bottom)

        const opponentCards = [opponentBoard[2][colIndex], opponentBoard[1][colIndex], opponentBoard[0][colIndex]];
        const playerCards = [playerBoard[0][colIndex], playerBoard[1][colIndex], playerBoard[2][colIndex]];

        // Check if this column is won and by whom
        const isWonByP1 = winningColumns && winningColumns[colIndex] === 'p1';
        const isWonByP2 = winningColumns && winningColumns[colIndex] === 'p2';

        return (
            <div
                key={colIndex}
                className={`shared-column ${isCurrentPlayer ? 'interactive' : ''}`}
            >
                {/* Opponent Side */}
                <div className="opponent-slots">
                    {opponentCards.map((card, idx) => (
                        <div
                            key={`opp-${idx}`}
                            className={`card-slot opponent-slot ${isWonByP2 ? 'winning-slot-p2' : ''}`}
                        >
                            {card ? (
                                <Card
                                    card={revealAll ? { ...card, isHidden: false } : card}
                                />
                            ) : (
                                <div className="empty-slot" onClick={() => isCurrentPlayer && onColumnClick(colIndex)} />
                            )}
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
                        <div
                            key={`pl-${idx}`}
                            className={`card-slot player-slot ${xWinner && idx === 2 && xWinner !== 'draw' ? 'winning-row-x' : ''
                                } ${isWonByP1 ? 'winning-slot-p1' : ''}`}
                        >
                            {card ? (
                                <Card
                                    card={revealAll ? { ...card, isHidden: false } : card}
                                    isPeeking={peekingCard === card.id}
                                    onClick={() => handleCardClick(card, colIndex, true)}
                                    onMouseDown={() => handleCardPressStart(card, colIndex, true)}
                                    onMouseUp={() => handleCardPressEnd(card, colIndex, true)}
                                    onMouseLeave={() => handleCardPressEnd(card, colIndex, true)}
                                    onTouchStart={() => handleCardPressStart(card, colIndex, true)}
                                    onTouchEnd={() => handleCardPressEnd(card, colIndex, true)}
                                />
                            ) : (
                                <div className="empty-slot" onClick={() => isCurrentPlayer && onColumnClick(colIndex)} />
                            )}
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
