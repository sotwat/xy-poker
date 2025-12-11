import React, { useState } from 'react';
import type { Card as CardType, DiceSkin, CardSkin, BoardSkin } from '../logic/types';
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
    selectedCardSkin: CardSkin;
    selectedBoardSkin: BoardSkin;
    scoringStep?: number;
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
    selectedSkin,
    selectedCardSkin,
    selectedBoardSkin,
    scoringStep = -1
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

        // ANIMATION LOGIC:
        // Steps 0-4 correspond to columns 4-0.
        // Current Step 0 -> Show Col 4.
        // Current Step 1 -> Show Col 4, 3.
        // Condition: (4 - colIndex) <= scoringStep
        // e.g. Col 4: (4-4)=0 <= 0 (Visible at Step 0+)
        // e.g. Col 0: (4-0)=4 <= 4 (Visible at Step 4+)
        const isColVisible = scoringStep >= (4 - colIndex);

        // Bottom Highlight Logic:
        const isBottomWon = winner === bottomPlayerId && isColVisible;
        const bottomWinningClass = isBottomWon ? `winning-slot-${bottomPlayerId}` : '';

        // Top Highlight Logic:
        const isTopWon = winner === topPlayerId && isColVisible;
        const topWinningClass = isTopWon ? `winning-slot-${topPlayerId}` : '';

        // X-Hand Highlight Logic
        // Highlight ONLY if scoringStep >= 5 (Row Step)
        const isRowVisible = scoringStep >= 5;
        const isTopXWinner = xWinner === topPlayerId && isRowVisible;
        const isBottomXWinner = xWinner === bottomPlayerId && isRowVisible;

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
                            className={`card-slot opponent-slot ${topWinningClass} ${isTopXWinner && idx === 0 ? 'winning-row-yellow' : ''}`}
                        >
                            {card ? (
                                <Card
                                    card={revealAll ? { ...card, isHidden: false } : card}
                                    skin={selectedCardSkin}
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
                            className={`card-slot player-slot ${isBottomXWinner && idx === 2 ? 'winning-row-yellow' : ''
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
                                    skin={selectedCardSkin}
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
        <div className={`shared-board board-theme-${selectedBoardSkin}`}>
            {columns}
        </div>
    );
};
