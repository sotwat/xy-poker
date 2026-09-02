import React from 'react';
import { Card } from './Card';
import type { Card as CardType } from '../logic/types';
import './ShowdownPopup.css';
import { translate } from '../i18n';

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
    const accentClass = `showdown-${data.winner}`;
    const handKindClass = data.isXHand ? 'showdown-x-hand' : 'showdown-y-hand';
    const winnerLabel = data.winner === 'draw'
        ? translate('en', 'common.draw')
        : data.winner === 'p1'
            ? translate('en', 'showdown.blueWins')
            : translate('en', 'showdown.redWins');
    const contextLabel = data.isXHand
        ? translate('en', 'showdown.finalX')
        : translate('en', 'showdown.dice', { value: data.diceValue ?? '—' });
    const announcement = `${contextLabel}. ${data.text}. ${winnerLabel}.`;

    return (
        <div
            className={`showdown-popup-overlay ${accentClass} ${handKindClass}`}
            role="status"
            aria-live="assertive"
            aria-atomic="true"
            aria-label={announcement}
            key={data.id}
        >
            <div className="showdown-flash" aria-hidden="true" />
            <div className="showdown-cut-panel panel-back" aria-hidden="true" />
            <div className="showdown-cut-panel panel-front" aria-hidden="true" />
            <div className="showdown-speed-field" aria-hidden="true" />
            <div className="showdown-impact-label" aria-hidden="true">SHOWDOWN</div>

            <div className="showdown-streaks" aria-hidden="true">
                {Array.from({ length: 7 }, (_, index) => (
                    <span
                        className="showdown-streak"
                        key={index}
                        style={{
                            '--streak-top': `${15 + index * 10}%`,
                            '--streak-delay': `${120 + index * 55}ms`,
                        } as React.CSSProperties}
                    />
                ))}
            </div>

            <div className="showdown-shards" aria-hidden="true">
                {Array.from({ length: 12 }, (_, index) => (
                    <span
                        className="showdown-shard"
                        key={index}
                        style={{
                            '--shard-angle': `${index * 30}deg`,
                            '--shard-delay': `${390 + index * 11}ms`,
                        } as React.CSSProperties}
                    />
                ))}
            </div>

            <div className="showdown-popup-content">
                <div className="showdown-context-line">
                    <span className="showdown-context-rule" aria-hidden="true" />
                    <span className="popup-subtitle">{contextLabel}</span>
                    <span className="showdown-context-rule" aria-hidden="true" />
                </div>

                {revealedCards.length > 0 && (
                    <div className="showdown-cards-container" aria-label={translate('en', 'showdown.winningCards')}>
                        {revealedCards.map((card, index) => (
                            <div
                                className="showdown-card-wrapper"
                                key={card.id || index}
                                style={{
                                    '--card-delay': `${220 + index * 105}ms`,
                                    '--card-edge-delay': `${600 + index * 105}ms`,
                                } as React.CSSProperties}
                            >
                                <Card card={card} size="normal" isHidden={false} />
                            </div>
                        ))}
                    </div>
                )}

                <div className="showdown-title-cut">
                    <span className="showdown-title-kicker" aria-hidden="true">SHOWDOWN</span>
                    <strong className="popup-title">{data.text}</strong>
                </div>

                <span className="popup-winner">{winnerLabel}</span>
            </div>
        </div>
    );
};
