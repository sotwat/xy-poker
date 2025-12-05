import React from 'react';
import type { Card as CardType } from '../logic/types';
import './Card.css';

interface CardProps {
    card: CardType;
    onClick?: () => void;
    isSelected?: boolean;
    isPlayable?: boolean;
    isPeeking?: boolean; // For revealing own hidden cards temporarily
    onMouseDown?: () => void;
    onMouseUp?: () => void;
    onMouseLeave?: () => void;
    onTouchStart?: () => void;
    onTouchEnd?: () => void;
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

export const Card: React.FC<CardProps> = ({
    card,
    onClick,
    isSelected,
    isPlayable,
    isPeeking,
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onTouchStart,
    onTouchEnd
}) => {

    // If hidden but peeking, show card face with overlay
    if (card.isHidden && !isPeeking) {
        return (
            <div
                className={`card hidden ${isSelected ? 'selected' : ''}`}
                onClick={onClick}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
            >
                <div className="card-back"></div>
            </div>
        );
    }

    const label = card.suit === 'joker' ? 'JOKER' : (RANK_LABELS[card.rank] || card.rank.toString());
    const icon = SUIT_ICONS[card.suit];

    return (
        <div
            className={`card ${card.suit} ${isSelected ? 'selected' : ''} ${isPlayable ? 'playable' : ''} ${isPeeking ? 'peeking' : ''}`}
            onClick={onClick}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            data-suit={card.suit}
        >
            {isPeeking && <div className="peek-overlay"></div>}
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
