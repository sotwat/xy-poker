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

const RANK_LABELS: Record<number, string> = {
    11: 'J',
    12: 'Q',
    13: 'K',
    14: 'A',
    15: 'JOKER', // For Joker rank
};

const SUIT_LABELS: Record<CardType['suit'], string> = {
    hearts: 'ハート',
    diamonds: 'ダイヤ',
    clubs: 'クラブ',
    spades: 'スペード',
};

interface SuitMarkProps {
    suit: CardType['suit'];
    className?: string;
}

const SuitMark: React.FC<SuitMarkProps> = ({ suit, className = '' }) => (
    <svg
        className={`suit-mark ${className}`}
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
    >
        {suit === 'hearts' && (
            <path d="M50 90C43 80 12 62 12 35 12 17 34 8 50 27 66 8 88 17 88 35 88 62 57 80 50 90Z" />
        )}
        {suit === 'diamonds' && <path d="M50 6 90 50 50 94 10 50Z" />}
        {suit === 'spades' && (
            <path d="M50 5C42 24 13 39 13 61c0 14 11 24 25 24 7 0 13-3 17-8-2 8-7 14-14 18h18c-7-4-12-10-14-18 4 5 10 8 17 8 14 0 25-10 25-24C87 39 58 24 50 5Z" />
        )}
        {suit === 'clubs' && (
            <>
                <circle cx="50" cy="27" r="21" />
                <circle cx="28" cy="57" r="21" />
                <circle cx="72" cy="57" r="21" />
                <path d="M43 55h14c0 20 5 31 16 40H27c11-9 16-20 16-40Z" />
            </>
        )}
    </svg>
);

const CourtPortrait: React.FC<{ rank: number }> = ({ rank }) => {
    if (rank === 13) {
        return (
            <svg className="court-portrait court-portrait-king" viewBox="0 0 100 132" aria-hidden="true" focusable="false">
                <path className="court-frame" d="M12 124 18 37 50 8 82 37 88 124Z" />
                <path className="court-accent" d="M25 38 29 11 43 26 50 7 57 26 71 11 75 38Z" />
                <circle className="court-face" cx="50" cy="55" r="17" />
                <path className="court-hair" d="M31 56c0-24 38-27 38 0v12l-9-7-10 8-10-8-9 7Z" />
                <path className="court-beard" d="M35 65q15 10 30 0c0 17-6 26-15 31-9-5-15-14-15-31Z" />
                <path className="court-robe" d="M20 124c3-27 14-44 30-44s27 17 30 44Z" />
                <path className="court-prop" d="M76 45v70M69 52h14M72 45a4 4 0 1 0 8 0 4 4 0 1 0-8 0" />
                <path className="court-detail" d="M43 57h2m10 0h2M43 66q7 5 14 0M33 113 50 86l17 27" />
            </svg>
        );
    }

    if (rank === 12) {
        return (
            <svg className="court-portrait court-portrait-queen" viewBox="0 0 100 132" aria-hidden="true" focusable="false">
                <path className="court-frame" d="M15 124 21 38Q50 5 79 38l6 86Z" />
                <path className="court-accent" d="M28 37 34 13 50 28 66 13 72 37 50 45Z" />
                <path className="court-hair" d="M27 54c0-30 46-32 46 0v47L62 84 50 96 38 84l-11 17Z" />
                <circle className="court-face" cx="50" cy="55" r="16" />
                <path className="court-robe" d="M18 124c5-31 17-43 32-43s27 12 32 43Z" />
                <path className="court-collar" d="m32 85 18 14 18-14-5 26H37Z" />
                <path className="court-accent" d="m50 94 8 11-8 12-8-12Z" />
                <path className="court-detail" d="M43 57h2m10 0h2M44 66q6 4 12 0" />
            </svg>
        );
    }

    return (
        <svg className="court-portrait court-portrait-jack" viewBox="0 0 100 132" aria-hidden="true" focusable="false">
            <path className="court-frame" d="M13 124 18 40 45 15 84 38 87 124Z" />
            <path className="court-accent" d="M25 40Q42 12 72 28L61 44Z" />
            <path className="court-feather" d="M61 27Q83 5 85 16 80 31 65 37Z" />
            <circle className="court-face" cx="49" cy="57" r="16" />
            <path className="court-hair" d="M31 56q2-20 19-20 18 0 19 22l-9-8-8 9-11-7-10 10Z" />
            <path className="court-robe" d="M19 124c4-29 16-44 31-44s27 15 31 44Z" />
            <path className="court-prop" d="m25 116 52-63M69 52l10 9M22 113l11 9" />
            <path className="court-detail" d="M42 59h2m10 0h2M44 68q6 3 12-1M33 113l17-27 17 27" />
        </svg>
    );
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
            aria-label={`${label} ${SUIT_LABELS[card.suit]}`}
        >
            {isPeeking && <div className="peek-overlay"></div>}
            <div className="card-index">
                <span className="rank">{label}</span>
            </div>
            <div className={`card-art ${isCourtCard ? `court-art court-${label.toLowerCase()}` : 'number-art'}`} aria-hidden="true">
                {isCourtCard ? (
                    <>
                        <CourtPortrait rank={card.rank} />
                        <SuitMark suit={card.suit} className="court-suit-mark" />
                    </>
                ) : (
                    <SuitMark suit={card.suit} className="large-suit" />
                )}
            </div>
        </div>
    );
};
