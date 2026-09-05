import React from 'react';
import './RulesModal.css';
import { Card } from './Card';
import type { Suit, Rank } from '../logic/types';
import { formatHandName, translate, useI18n } from '../i18n';
import { Modal } from './Modal';

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
const HandExample: React.FC<{ title: string; cards: ReturnType<typeof c>[] }> = ({ title, cards }) => (
    <div className="hand-example">
        <div className="hand-header">
            <span className="hand-title">{title}</span>
        </div>
        <div className="hand-cards">
            {cards.map((card, i) => (
                <Card key={i} card={card} size="xs" />
            ))}
        </div>
    </div>
);

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => {
    const { t: uiText, rulesLanguage, setRulesLanguage } = useI18n();
    const t = (key: string) => translate(rulesLanguage, key);
    const handName = (type: string) => formatHandName(type, rulesLanguage);
    return (
        <Modal className="rules-overlay" label="RULES" onClose={onClose}>
            <div className="rules-content" lang={rulesLanguage} onClick={e => e.stopPropagation()}>
                <button type="button" className="close-btn" onClick={onClose} aria-label={uiText('common.close')}>×</button>
                <div className="rules-heading">
                    <h2>RULES</h2>
                    <label className="rules-language">
                        <span className="sr-only">Rules language</span>
                        <select value={rulesLanguage} onChange={event => setRulesLanguage(event.target.value === 'en' ? 'en' : 'ja')}>
                            <option value="ja">日本語</option>
                            <option value="en">English</option>
                        </select>
                    </label>
                </div>

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
                                        cards={[c(5, 'hearts'), c(6, 'hearts'), c(7, 'hearts')]}
                                    />
                                    <HandExample
                                        title={handName('ThreeOfAKind')}
                                        cards={[c(8, 'clubs'), c(8, 'diamonds'), c(8, 'spades')]}
                                    />
                                    <HandExample
                                        title={handName('StraightFlush')}
                                        cards={[c(7, 'spades'), c(9, 'spades'), c(8, 'spades')]}
                                    />
                                    <HandExample
                                        title={handName('PureStraight')}
                                        cards={[c(3, 'clubs'), c(4, 'hearts'), c(5, 'diamonds')]}
                                    />
                                    <HandExample
                                        title={handName('Flush')}
                                        cards={[c(2, 'clubs'), c(9, 'clubs'), c(11, 'clubs')]}
                                    />
                                    <HandExample
                                        title={handName('PureOnePair')}
                                        cards={[c(5, 'hearts'), c(5, 'clubs'), c(9, 'diamonds')]}
                                    />
                                    <HandExample
                                        title={handName('Straight')}
                                        cards={[c(4, 'diamonds'), c(6, 'spades'), c(5, 'clubs')]}
                                    />
                                    <HandExample
                                        title={handName('OnePair')}
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
                <button type="button" className="rules-close-btn" onClick={onClose}>{uiText('common.close')}</button>
            </div>
        </Modal>
    );
};
