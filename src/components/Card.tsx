import React from 'react';
import type { Card as CardType, CardSkin } from '../logic/types';
import './Card.css';

interface CardProps {
    card: CardType;
    onClick?: () => void;
    isSelected?: boolean;
    isPlayable?: boolean;
    isPeeking?: boolean; // For revealing own hidden cards temporarily
    isHidden?: boolean; // Override to force hide
    onMouseDown?: () => void;
    onMouseUp?: () => void;
    onMouseLeave?: () => void;
    onTouchStart?: () => void;
    onTouchEnd?: () => void;
    skin?: CardSkin;
    size?: 'normal' | 'small' | 'xs';
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
    isHidden,
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onTouchStart,
    onTouchEnd,
    skin = 'classic',
    size = 'normal'
}) => {

    // If hidden but peeking, show card face with overlay
    const shouldHide = (card.isHidden || isHidden) && !isPeeking;

    if (shouldHide) {
        return (
            <div
                className={`card ${size} hidden ${isSelected ? 'selected' : ''} card-back-${skin}`}
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

    const label = RANK_LABELS[card.rank] || card.rank.toString();
    const icon = SUIT_ICONS[card.suit];
    const isCourtCard = card.rank >= 11 && card.rank <= 13;

    return (
        <div
            className={`card ${size} ${card.suit} ${isSelected ? 'selected' : ''} ${isPlayable ? 'playable' : ''} ${isPeeking ? 'peeking' : ''}`}
            onClick={onClick}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            data-suit={card.suit}
        >
            {isPeeking && <div className="peek-overlay"></div>}
            <div className="card-index">
                <span className="rank">{label}</span>
            </div>
            <div className={`card-art ${isCourtCard ? `court-art court-${label.toLowerCase()}` : 'number-art'}`} aria-hidden="true">
                {isCourtCard ? (
                    <>
                        <svg className="court-portrait" viewBox="0 0 100 132" focusable="false">
                            <path className="court-frame" d="M14 123 20 34 50 10 80 34 86 123Z" />
                            <path className="court-accent" d="M27 39 34 14 50 29 66 14 73 39 50 49Z" />
                            <circle className="court-face" cx="50" cy="55" r="17" />
                            <path className="court-hair" d="M30 59c0-26 40-29 40 1v14l-10-9-10 8-10-8-10 9Z" />
                            <path className="court-robe" d="M22 123c2-31 14-46 28-46s26 15 28 46Z" />
                            <path className="court-detail" d="m32 113 18-30 18 30M38 47c6-8 18-8 24 0M43 60h2m10 0h2" />
                            {label === 'K' && <path className="court-accent" d="M46 78h8v45h-8z" />}
                            {label === 'Q' && <path className="court-accent" d="m50 84 8 13-8 13-8-13Z" />}
                            {label === 'J' && <path className="court-accent" d="m37 91 26 21-5 7-26-21Z" />}
                        </svg>
                        <span className="court-suit-mark">{icon}</span>
                    </>
                ) : (
                    <span className="large-suit">{icon}</span>
                )}
            </div>
        </div>
    );
};
