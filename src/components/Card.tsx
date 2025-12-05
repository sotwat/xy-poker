import React from 'react';
import type { Card as CardType } from '../logic/types';
import './Card.css';

interface CardProps {
    card: CardType;
    onClick?: () => void;
    isSelected?: boolean;
    isPlayable?: boolean;
    canPeek?: boolean;
}

const SUIT_ICONS: Record<string, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
    joker: '★',
};

const RANK_LABELS: Record<number, string> = {
    11: 'J',
    12: 'Q',
    13: 'K',
    14: 'A',
    15: 'JOKER', // For Joker rank
};

export const Card: React.FC<CardProps> = ({ card, onClick, isSelected, isPlayable, canPeek = false }) => {
    const [isPeeking, setIsPeeking] = React.useState(false);

    const handlePeekStart = () => {
        if (canPeek && card.isHidden) {
            setIsPeeking(true);
        }
    };

    const handlePeekEnd = () => {
        setIsPeeking(false);
    };

    if (card.isHidden && !isPeeking) {
        return (
            <div
                className={`card hidden ${isSelected ? 'selected' : ''}`}
                onClick={onClick}
                onMouseDown={handlePeekStart}
                onMouseUp={handlePeekEnd}
                onMouseLeave={handlePeekEnd}
                onTouchStart={handlePeekStart}
                onTouchEnd={handlePeekEnd}
            >
                <div className="card-back"></div>
            </div>
        );
    }

    const label = card.suit === 'joker' ? 'JOKER' : (RANK_LABELS[card.rank] || card.rank.toString());
    const icon = SUIT_ICONS[card.suit];
    const peekClass = isPeeking ? 'peeking' : '';

    return (
        <div
            className={`card ${card.suit} ${isSelected ? 'selected' : ''} ${isPlayable ? 'playable' : ''} ${peekClass}`}
            onClick={onClick}
            data-suit={card.suit}
            onMouseDown={handlePeekStart}
            onMouseUp={handlePeekEnd}
            onMouseLeave={handlePeekEnd}
            onTouchStart={handlePeekStart}
            onTouchEnd={handlePeekEnd}
        >
            <div className="card-top">
                <span className="rank">{label}</span>
                <span className="suit">{icon}</span>
            </div>
            <div className="card-center">
                {icon}
            </div>
            <div className="card-bottom">
                <span className="rank">{label}</span>
                <span className="suit">{icon}</span>
            </div>
        </div>
    );
};
