import React, { useState } from 'react';
import type { Card as CardType, DiceSkin } from '../logic/types';
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
    bottomPlayerId?: 'p1' | 'p2'; // 'p1' means P1 is at bottom (blue), 'p2' means P2 is at bottom (red)
    selectedSkin: DiceSkin;
}

export const SharedBoard: React.FC<SharedBoardProps> = ({
    playerBoard,
    opponentBoard,
    dice,
    onColumnClick,
    isCurrentPlayer,
    revealAll = false,
    winningColumns,
    xWinner,
    bottomPlayerId = 'p1', // Default to P1 at bottom
    selectedSkin
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
        // Define who is Top relative to the Board View
        // If bottomPlayerId is 'p1', then Top is P2.
        // If bottomPlayerId is 'p2', then Top is P1.
        const topPlayerId = bottomPlayerId === 'p1' ? 'p2' : 'p1';

        const opponentCards = [opponentBoard[2][colIndex], opponentBoard[1][colIndex], opponentBoard[0][colIndex]];
        const playerCards = [playerBoard[0][colIndex], playerBoard[1][colIndex], playerBoard[2][colIndex]];

        // Determine if Top/Bottom rows are won
        // winningColumns[colIndex] returns 'p1' or 'p2' (the winner)
        const winner = winningColumns ? winningColumns[colIndex] : null;

        // Bottom Highlight Logic:
        // Highlight if the winner MATCHES the bottom player ID.
        // And apply class based on the winner ID (p1=Blue, p2=Red).
        const isBottomWon = winner === bottomPlayerId;
        const bottomWinningClass = isBottomWon ? `winning-slot-${bottomPlayerId}` : '';

        // Top Highlight Logic:
        // Highlight if the winner MATCHES the top player ID.
        const isTopWon = winner === topPlayerId;
        const topWinningClass = isTopWon ? `winning-slot-${topPlayerId}` : '';

        // X-Hand Highlight Logic
        // Row 2 is the X-Hand row.
        // For Opponent (Top), cards are [Row2, Row1, Row0], so Row 2 is idx 0.
        // For Player (Bottom), cards are [Row0, Row1, Row2], so Row 2 is idx 2.
        const isTopXWinner = xWinner === topPlayerId;
        const isBottomXWinner = xWinner === bottomPlayerId;

        return (
            <div
                key={colIndex}
                className={`shared-column ${isCurrentPlayer ? 'interactive' : ''}`}
            >
                {/* Opponent Side (Top) */}
                <div className="opponent-slots">
                    {opponentCards.map((card, idx) => (
                        <div
                            key={`opp-${idx}`}
                            className={`card-slot opponent-slot ${topWinningClass} ${isTopXWinner && idx === 0 ? 'winning-row-x' : ''}`}
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
                    <Dice value={dice[colIndex]} skin={selectedSkin} />
                </div>

                {/* Player Side (Bottom) */}
                <div className="player-slots">
                    {playerCards.map((card, idx) => (
                        <div
                            key={`pl-${idx}`}
                            className={`card-slot player-slot ${isBottomXWinner && idx === 2 ? 'winning-row-x' : ''
                                } ${bottomWinningClass}`}
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
