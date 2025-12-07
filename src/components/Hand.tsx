import React from 'react';
import type { Card as CardType } from '../logic/types';
import { Card } from './Card';
import './Hand.css';

interface HandProps {
    hand: CardType[];
    selectedCardId?: string | null;
    onCardSelect: (cardId: string) => void;
    isCurrentPlayer?: boolean;
    isOpponent?: boolean;
    isHidden?: boolean;
    onCardClick?: () => void; // Fallback if different from onCardSelect
}

export const Hand: React.FC<HandProps> = ({
    hand,
    selectedCardId,
    onCardSelect,
    isCurrentPlayer = false,
    isOpponent = false,
    isHidden = false,
    onCardClick
}) => {
    return (
        <div className={`hand ${isCurrentPlayer ? 'active' : ''} ${isOpponent ? 'opponent' : ''}`}>
            {hand.map(card => (
                <div key={card.id} className="hand-card-wrapper">
                    <Card
                        card={card}
                        isSelected={selectedCardId === card.id}
                        onClick={() => {
                            if (isCurrentPlayer && onCardSelect) onCardSelect(card.id);
                            else if (onCardClick) onCardClick();
                        }}
                        isPlayable={isCurrentPlayer}
                        isHidden={isHidden}
                    />
                </div>
            ))}
        </div>
    );
};
