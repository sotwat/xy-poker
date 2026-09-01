import React, { useRef, useState } from 'react';
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
    revealedCols?: number[];
    showXHand?: boolean;
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
    revealedCols = [],
    showXHand = false
}) => {
    const [peekingCard, setPeekingCard] = useState<string | null>(null);
    const pressTimerRef = useRef<number | null>(null);
    const longPressTriggeredRef = useRef(false);

    const clearPressTimer = () => {
        if (pressTimerRef.current !== null) {
            window.clearTimeout(pressTimerRef.current);
            pressTimerRef.current = null;
        }
    };

    const handleCardPressStart = (card: CardType | null, isPlayerCard: boolean) => {
        if (!card) return;
        clearPressTimer();
        longPressTriggeredRef.current = false;

        // If it's own hidden card, start long press timer
        if (isPlayerCard && card.isHidden && !revealAll) {
            pressTimerRef.current = window.setTimeout(() => {
                longPressTriggeredRef.current = true;
                setPeekingCard(card.id);
                pressTimerRef.current = null;
            }, 500); // 500ms long press
        }
    };

    const handleCardPressEnd = () => {
        clearPressTimer();
        setPeekingCard(null);
    };

    const handlePlayerSlotClick = (card: CardType | null, colIndex: number) => {
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
        }
        if (isCurrentPlayer && (!card || !card.isHidden || revealAll)) {
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
        // isColVisible checks if this colIndex has been revealed yet
        const isColVisible = revealedCols.includes(colIndex);

        // Bottom Highlight Logic:
        const isBottomWon = winner === bottomPlayerId && isColVisible;
        const bottomWinningClass = isBottomWon ? `winning-slot-${bottomPlayerId}` : '';

        // Top Highlight Logic:
        const isTopWon = winner === topPlayerId && isColVisible;
        const topWinningClass = isTopWon ? `winning-slot-${topPlayerId}` : '';

        // X-Hand Highlight Logic
        // Highlight ONLY if showXHand is true
        const isRowVisible = showXHand;
        const isTopXWinner = xWinner === topPlayerId && isRowVisible;
        const isBottomXWinner = xWinner === bottomPlayerId && isRowVisible;

        const isColWonP1 = winner === 'p1' && isColVisible;
        const isColWonP2 = winner === 'p2' && isColVisible;
        const colWinningClass = isColWonP1 ? 'winning-column-p1' : (isColWonP2 ? 'winning-column-p2' : '');

        return (
            <div
                key={colIndex}
                className={`shared-column ${isCurrentPlayer ? 'interactive' : ''} ${colWinningClass}`}
                role={isCurrentPlayer ? 'button' : undefined}
                tabIndex={isCurrentPlayer ? 0 : -1}
                aria-label={isCurrentPlayer ? `Place selected card in column ${colIndex + 1}, dice ${dice[colIndex]}` : undefined}
                onKeyDown={(event) => {
                    if (isCurrentPlayer && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        onColumnClick(colIndex);
                    }
                }}
            >
                {/* Opponent Side (Top) */}
                <div className="opponent-slots">
                    {opponentCards.map((card, idx) => (
                        <div
                            key={`opp-${idx}`}
                            className={`card-slot opponent-slot ${topWinningClass} ${isTopXWinner && idx === 0 ? 'winning-row-yellow' : ''}`}
                            onClick={() => isCurrentPlayer && onColumnClick(colIndex)}
                        >
                            {card ? (
                                <Card
                                    card={revealAll ? { ...card, isHidden: false } : card}
                                    skin={selectedCardSkin}
                                />
                            ) : <div className="empty-slot" />}
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
                            onPointerDown={() => handleCardPressStart(card, true)}
                            onPointerUp={handleCardPressEnd}
                            onPointerLeave={handleCardPressEnd}
                            onPointerCancel={handleCardPressEnd}
                            onClick={() => handlePlayerSlotClick(card, colIndex)}
                        >
                            {card ? (
                                <Card
                                    card={revealAll ? { ...card, isHidden: false } : card}
                                    isPeeking={peekingCard === card.id}
                                    skin={selectedCardSkin}
                                />
                            ) : <div className="empty-slot" />}
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
