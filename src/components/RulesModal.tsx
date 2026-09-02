import React from 'react';
import './RulesModal.css';
import { Card } from './Card';
import type { Suit, Rank } from '../logic/types';
import { useI18n } from '../i18n';

interface RulesModalProps {
    onClose: () => void;
}

// Helper to create simple card objects
const c = (rank: number, suit: Suit) => ({
    id: `demo-${rank}-${suit}-${Math.random()}`,
    rank: rank as Rank,
    suit,
    isJoker: false,
    isHidden: false,
    isFlipped: false
});

// Hand Example Component
const HandExample: React.FC<{ title: string; note?: string; cards: ReturnType<typeof c>[] }> = ({ title, note, cards }) => (
    <div className="hand-example">
        <div className="hand-header">
            <span className="hand-title">{title}</span>
            {note && <span className="hand-note">{note}</span>}
        </div>
        <div className="hand-cards">
            {cards.map((card, i) => (
                <Card key={i} card={card} size="xs" />
            ))}
        </div>
    </div>
);

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => {
    const { t, handName } = useI18n();
    return (
        <div className="rules-overlay" onClick={onClose}>
            <div className="rules-content" onClick={e => e.stopPropagation()}>
                <button type="button" className="close-btn" onClick={onClose} aria-label={t('common.close')}>×</button>
                <h2>{t('rules.title')}</h2>

                <div className="rules-scroll-area">
                    <section>
                        <h3>{t('rules.goal')}</h3>
                        <p>{t('rules.goalText')}</p>
                    </section>

                    <section>
                        <h3>{t('rules.flow')}</h3>
                        <ul>
                            <li>{t('rules.turns')}</li>
                            <li>{t('rules.xAxis')}</li>
                            <li>{t('rules.yAxis')}</li>
                        </ul>
                    </section>

                    <section>
                        <h3>{t('rules.pureNormal')}</h3>
                        <p>{t('rules.pureIntro')}</p>
                        <ul>
                            <li>
                                <ul>
                                    <li>{t('rules.pureStraight')}</li>
                                    <li>{t('rules.purePair')}</li>
                                </ul>
                            </li>
                            <li>{t('rules.normal')}</li>
                        </ul>
                    </section>

                    <section>
                        <h3>{t('rules.rankings')}</h3>
                        <div className="rankings-grid">
                            {/* X-AXIS HANDS */}
                            <div className="ranking-column">
                                <h4>{t('rules.xHeading')}</h4>
                                <div className="hand-list-visual">
                                    <HandExample
                                        title={handName('RoyalFlush')}
                                        cards={[c(10, 'spades'), c(11, 'spades'), c(12, 'spades'), c(13, 'spades'), c(14, 'spades')]}
                                    />
                                    <HandExample
                                        title={handName('StraightFlush')}
                                        cards={[c(5, 'hearts'), c(6, 'hearts'), c(7, 'hearts'), c(8, 'hearts'), c(9, 'hearts')]}
                                    />
                                    <HandExample
                                        title={handName('FourOfAKind')}
                                        cards={[c(8, 'clubs'), c(8, 'diamonds'), c(8, 'hearts'), c(8, 'spades'), c(13, 'clubs')]}
                                    />
                                    <HandExample
                                        title={handName('FullHouse')}
                                        cards={[c(12, 'diamonds'), c(12, 'clubs'), c(12, 'hearts'), c(9, 'spades'), c(9, 'clubs')]}
                                    />
                                    <HandExample
                                        title={handName('Flush')}
                                        cards={[c(2, 'diamonds'), c(5, 'diamonds'), c(8, 'diamonds'), c(11, 'diamonds'), c(13, 'diamonds')]}
                                    />
                                    <HandExample
                                        title={handName('Straight')}
                                        cards={[c(3, 'clubs'), c(4, 'diamonds'), c(5, 'hearts'), c(6, 'spades'), c(7, 'clubs')]}
                                    />
                                    <HandExample
                                        title={handName('ThreeOfAKind')}
                                        cards={[c(7, 'spades'), c(7, 'hearts'), c(7, 'clubs'), c(2, 'diamonds'), c(12, 'clubs')]}
                                    />
                                    <HandExample
                                        title={handName('TwoPair')}
                                        cards={[c(11, 'hearts'), c(11, 'clubs'), c(4, 'diamonds'), c(4, 'spades'), c(14, 'clubs')]}
                                    />
                                    <HandExample
                                        title={handName('OnePair')}
                                        cards={[c(9, 'clubs'), c(9, 'spades'), c(2, 'hearts'), c(5, 'diamonds'), c(13, 'clubs')]}
                                    />
                                    <HandExample
                                        title={handName('HighCard')}
                                        cards={[c(14, 'spades'), c(11, 'hearts'), c(8, 'clubs'), c(5, 'diamonds'), c(2, 'spades')]}
                                    />
                                </div>
                            </div>

                            {/* Y-AXIS HANDS */}
                            <div className="ranking-column">
                                <h4>{t('rules.yHeading')}</h4>
                                <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>
                                    {t('rules.orderNote')}
                                </p>
                                <div className="hand-list-visual">
                                    <HandExample
                                        title={handName('PureStraightFlush')}
                                        note={t('rules.ordered')}
                                        cards={[c(5, 'hearts'), c(6, 'hearts'), c(7, 'hearts')]}
                                    />
                                    <HandExample
                                        title={handName('ThreeOfAKind')}
                                        cards={[c(8, 'clubs'), c(8, 'diamonds'), c(8, 'spades')]}
                                    />
                                    <HandExample
                                        title={handName('StraightFlush')}
                                        note={t('rules.unordered')}
                                        cards={[c(7, 'spades'), c(9, 'spades'), c(8, 'spades')]}
                                    />
                                    <HandExample
                                        title={handName('PureStraight')}
                                        note={t('rules.ordered')}
                                        cards={[c(3, 'clubs'), c(4, 'hearts'), c(5, 'diamonds')]}
                                    />
                                    <HandExample
                                        title={handName('Flush')}
                                        cards={[c(2, 'clubs'), c(9, 'clubs'), c(11, 'clubs')]}
                                    />
                                    <HandExample
                                        title={handName('PureOnePair')}
                                        note={t('rules.adjacent')}
                                        cards={[c(5, 'hearts'), c(5, 'clubs'), c(9, 'diamonds')]}
                                    />
                                    <HandExample
                                        title={handName('Straight')}
                                        note={t('rules.unordered')}
                                        cards={[c(4, 'diamonds'), c(6, 'spades'), c(5, 'clubs')]}
                                    />
                                    <HandExample
                                        title={handName('OnePair')}
                                        note={t('rules.split')}
                                        cards={[c(8, 'clubs'), c(12, 'diamonds'), c(8, 'spades')]}
                                    />
                                    <HandExample
                                        title={handName('HighCard')}
                                        cards={[c(13, 'hearts'), c(5, 'clubs'), c(2, 'diamonds')]}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
                <button type="button" className="rules-close-btn" onClick={onClose}>{t('common.close')}</button>
            </div>
        </div >
    );
};
