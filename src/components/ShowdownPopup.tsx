import React from 'react';
import { Card } from './Card';
import type { Card as CardType } from '../logic/types';
import './ShowdownPopup.css';
import { useI18n } from '../i18n';

export interface PopupData {
    id: string;
    text: string;
    winner: 'p1' | 'p2' | 'draw';
    diceValue?: number;
    isXHand: boolean;
    cards?: CardType[];
    step?: number;
}

interface ShowdownPopupProps {
    data: PopupData | null;
    playerNames?: [string, string];
}

export const ShowdownPopup: React.FC<ShowdownPopupProps> = ({ data, playerNames }) => {
    const { t } = useI18n();
    if (!data) return null;

    const revealedCards = data.cards?.map(card => ({ ...card, isHidden: false })) ?? [];
    const accentClass = `showdown-${data.winner}`;
    const handKindClass = data.isXHand ? 'showdown-x-hand' : 'showdown-y-hand';
    const winnerLabel = data.winner === 'draw'
        ? t('common.draw')
        : playerNames
            ? t('gameInfo.winner', { name: playerNames[data.winner === 'p1' ? 0 : 1] })
            : t(data.winner === 'p1' ? 'showdown.blueWins' : 'showdown.redWins');
    const contextLabel = data.isXHand
        ? t('showdown.finalX')
        : t('showdown.dice', { value: data.diceValue ?? '' });
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
            <div className="showdown-round" aria-hidden="true">
                <span>{data.isXHand ? 'X / FINAL' : `Y / ${String((data.step ?? 0) + 1).padStart(2, '0')}`}</span>
                <div className="showdown-progress">{Array.from({ length: 6 }, (_, index) => <i key={index} className={index <= (data.step ?? (data.isXHand ? 5 : 0)) ? 'revealed' : ''} />)}</div>
            </div>
            <div className="showdown-flash" aria-hidden="true" />
            <div className="showdown-cut-panel panel-back" aria-hidden="true" />
            <div className="showdown-cut-panel panel-front" aria-hidden="true" />
            <div className="showdown-speed-field" aria-hidden="true" />
            <div className="showdown-energy-rings" aria-hidden="true">
                {Array.from({ length: 3 }, (_, index) => (
                    <span
                        className="showdown-energy-ring"
                        key={index}
                        style={{ '--ring-delay': `${300 + index * 105}ms` } as React.CSSProperties}
                    />
                ))}
            </div>
            <div className="showdown-light-sweep" aria-hidden="true" />
            <div className="showdown-bolts" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                    <span
                        className="showdown-bolt"
                        key={index}
                        style={{
                            '--bolt-angle': `${index * 45 + 18}deg`,
                            '--bolt-delay': `${480 + index * 18}ms`,
                        } as React.CSSProperties}
                    />
                ))}
            </div>
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
                    <div className="showdown-cards-container" aria-label={t('showdown.winningCards')}>
                        {revealedCards.map((card, index) => (
                            <div
                                className="showdown-card-wrapper"
                                key={card.id || index}
                                style={{
                                    '--card-delay': `${150 + index * 110}ms`,
                                    '--card-edge-delay': `${610 + index * 110}ms`,
                                    '--card-entry-y': `${(index % 2 === 0 ? 1 : -1) * (22 + index * 3)}px`,
                                } as React.CSSProperties}
                            >
                                <Card card={card} size="normal" isHidden={false} />
                            </div>
                        ))}
                    </div>
                )}

                <div className="showdown-title-cut">
                    <span className="showdown-title-kicker" aria-hidden="true">SHOWDOWN</span>
                    <strong className="popup-title" data-text={data.text}>{data.text}</strong>
                </div>

                <span className="popup-winner">{winnerLabel}</span>
                {!data.isXHand && data.winner !== 'draw' && data.diceValue !== undefined && (
                    <div className="showdown-award">+{data.diceValue}<small>pt</small></div>
                )}
            </div>
        </div>
    );
};
