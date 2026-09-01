import React from 'react';
import { Card } from './Card';
import type { Card as CardType } from '../logic/types';
import './ShowdownPopup.css';

export interface PopupData {
    id: string;
    text: string;
    winner: 'p1' | 'p2' | 'draw';
    diceValue?: number;
    isXHand: boolean;
    cards?: CardType[];
}

interface ShowdownPopupProps {
    data: PopupData | null;
}

export const ShowdownPopup: React.FC<ShowdownPopupProps> = ({ data }) => {
    if (!data) return null;

    const revealedCards = data.cards?.map(card => ({ ...card, isHidden: false })) ?? [];
    const winnerLabel = data.winner === 'draw'
        ? 'Draw'
        : data.winner === 'p1'
            ? 'Blue wins'
            : 'Red wins';

    return (
        <div
            className="showdown-popup-overlay"
            role="status"
            aria-live="assertive"
            aria-atomic="true"
            key={data.id}
        >
            <div className={`showdown-popup-content popup-${data.winner}`}>
                <span className="popup-subtitle">
                    {data.isXHand ? 'X-HAND' : `DICE ${data.diceValue ?? '—'}`}
                </span>
                <strong className="popup-title">{data.text}</strong>
                <span className="popup-winner">{winnerLabel}</span>

                {revealedCards.length > 0 && (
                    <div className="showdown-cards-container" aria-label="Winning cards">
                        {revealedCards.map((card, index) => (
                            <div className="showdown-card-wrapper" key={card.id || index}>
                                <Card card={card} size="normal" isHidden={false} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
