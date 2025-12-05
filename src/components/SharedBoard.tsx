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
}

export const SharedBoard: React.FC<SharedBoardProps> = ({
    playerBoard,
    opponentBoard,
    dice,
    onColumnClick,
    isCurrentPlayer,
    revealAll = false
}) => {
    const [peekingCard, setPeekingCard] = useState<string | null>(null);

    const handleCardClick = (card: CardType | null, colIndex: number, isPlayerCard: boolean) => {
        if (!card) return;

        // If clicking own hidden card, toggle peek
        if (isPlayerCard && card.isHidden && !revealAll) {
            if (peekingCard === card.id) {
                setPeekingCard(null); // Hide if already peeking
            } else {
                setPeekingCard(card.id); // Peek at this card
            }
        } else if (isCurrentPlayer) {
            // Normal column click for placing cards
            onColumnClick(colIndex);
        }
    };

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
            >
                {/* Opponent Side */}
                <div className="opponent-slots">
                    {opponentCards.map((card, idx) => (
                        <div key={`opp-${idx}`} className="card-slot opponent-slot">
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
                        <div key={`pl-${idx}`} className="card-slot player-slot">
                            {card ? (
                                <Card
                                    card={revealAll ? { ...card, isHidden: false } : card}
                                    isPeeking={peekingCard === card.id}
                                    onClick={() => handleCardClick(card, colIndex, true)}
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
