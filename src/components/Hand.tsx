import React from 'react';
import type { Card as CardType } from '../logic/types';
import { Card } from './Card';
import './Hand.css';

interface HandProps {
    hand: CardType[];
    selectedCardId: string | null;
    onCardSelect: (cardId: string) => void;
    isCurrentPlayer: boolean;
}

export const Hand: React.FC<HandProps> = ({ hand, selectedCardId, onCardSelect, isCurrentPlayer }) => {
    return (
        <div className={`hand ${isCurrentPlayer ? 'active' : ''}`}>
            {hand.map(card => (
                <div key={card.id} className="hand-card-wrapper">
                    <Card
                        card={card}
                        isSelected={selectedCardId === card.id}
                        onClick={() => isCurrentPlayer && onCardSelect(card.id)}
                        isPlayable={isCurrentPlayer}
                    />
                </div>
            ))}
        </div>
    );
};
