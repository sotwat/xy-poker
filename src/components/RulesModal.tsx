import { useRef, useState } from 'react';
import './RulesModal.css';
import { Card } from './Card';
import rulesLettering from '../assets/lettering/vectura-rules.png';
import { getXHandBaseScore } from '../logic/scoring';
import type { Suit, Rank } from '../logic/types';
import { formatHandName, translate, useI18n } from '../i18n';
import { Modal } from './Modal';

interface RulesModalProps {
    onClose: () => void;
}

const c = (rank: number, suit: Suit) => ({
    id: `demo-${rank}-${suit}`,
    rank: rank as Rank,
    suit,
    isJoker: false,
    isHidden: false,
    isFlipped: false
});

function HandExample({ title, score, cards }: { title: string; score?: string; cards: ReturnType<typeof c>[] }) {
    return (
        <li className="rulebook-hand">
            <div className="rulebook-hand-heading">
                <span>{title}</span>
                {score !== undefined && <span className="rulebook-score">{score}</span>}
            </div>
            <div className="rulebook-cards">
                {cards.map(card => <Card key={card.id} card={card} size="xs" />)}
            </div>
        </li>
    );
}

type RulesPage = 'basics' | 'y' | 'x';

export function RulesModal({ onClose }: RulesModalProps) {
    const { t: uiText, rulesLanguage, setRulesLanguage } = useI18n();
    const [page, setPage] = useState<RulesPage>('basics');
    const bodyRef = useRef<HTMLDivElement>(null);
    const t = (key: string) => translate(rulesLanguage, key);
    const handName = (type: string) => formatHandName(type, rulesLanguage);

    function changePage(next: RulesPage) {
        setPage(next);
        bodyRef.current?.scrollTo(0, 0);
    }

    return (
        <Modal className="rules-overlay" label="RULES" onClose={onClose}>
            <div className="rules-content rulebook" lang={rulesLanguage}>
                <header className="rulebook-header">
                    <h2><img src={rulesLettering} alt="RULES" /></h2>
                    <select aria-label="Rules language" value={rulesLanguage} onChange={event => setRulesLanguage(event.target.value === 'en' ? 'en' : 'ja')}>
                        <option value="ja">日本語</option>
                        <option value="en">English</option>
                    </select>
                    <button type="button" className="rulebook-close" onClick={onClose} aria-label={uiText('common.close')}>×</button>
                </header>
                <nav className="rulebook-nav" aria-label={t('rules.title')}>
                    {(['basics', 'y', 'x'] as const).map(item => (
                        <button key={item} type="button" aria-pressed={page === item} aria-controls="rulebook-body" onClick={() => changePage(item)}>
                            {t(`rules.${item}Tab`)}
                        </button>
                    ))}
                </nav>
                <div className="rulebook-body" id="rulebook-body" ref={bodyRef} tabIndex={0} role="region" aria-label={t(`rules.${page}Tab`)}>
                    {page === 'basics' && <dl className="rulebook-basics">
                        {['turn', 'bonus', 'hidden', 'y', 'x', 'end'].map(item => {
                            const text = t(`rules.${item}Text`);
                            const paragraphs = rulesLanguage === 'ja' ? text.split(/(?<=。)/).filter(Boolean) : [text];
                            return <div key={item}>
                                <dt>{t(`rules.${item}Label`)}</dt>
                                <dd>{paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</dd>
                            </div>;
                        })}
                    </dl>}
                    {page === 'y' && <article>
                        <div className="rulebook-notes">
                            <p>{t('rules.yScoring')}</p>
                            <p>{t('rules.yTie')}</p>
                            <p>{t('rules.pureStraight')}</p>
                            <p>{t('rules.purePair')}</p>
                            <p>{t('rules.orderNote')}</p>
                        </div>
                        <ol className="rulebook-hands" aria-label={t('rules.rankings')}>
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
                        </ol>
                    </article>}
                    {page === 'x' && <article>
                        <div className="rulebook-notes">
                            <p>{t('rules.xScoring')}</p>
                            <p>{t('rules.xTie')}</p>
                            <p>{t('rules.xExact')}</p>
                            <p>{t('rules.xOrder')}</p>
                        </div>
                        <ol className="rulebook-hands" aria-label={t('rules.rankings')}>
                            <HandExample
                                title={handName('RoyalFlush')}
                                score={t('rules.royalWin')}
                                cards={[c(10, 'spades'), c(11, 'spades'), c(12, 'spades'), c(13, 'spades'), c(14, 'spades')]}
                            />
                            <HandExample
                                title={handName('StraightFlush')}
                                score={`${getXHandBaseScore('StraightFlush')} ${t('rules.pointsUnit')}`}
                                cards={[c(5, 'hearts'), c(6, 'hearts'), c(7, 'hearts'), c(8, 'hearts'), c(9, 'hearts')]}
                            />
                            <HandExample
                                title={handName('FourOfAKind')}
                                score={`${getXHandBaseScore('FourOfAKind')} ${t('rules.pointsUnit')}`}
                                cards={[c(8, 'clubs'), c(8, 'diamonds'), c(8, 'hearts'), c(8, 'spades'), c(13, 'clubs')]}
                            />
                            <HandExample
                                title={handName('FullHouse')}
                                score={`${getXHandBaseScore('FullHouse')} ${t('rules.pointsUnit')}`}
                                cards={[c(12, 'diamonds'), c(12, 'clubs'), c(12, 'hearts'), c(9, 'spades'), c(9, 'clubs')]}
                            />
                            <HandExample
                                title={handName('Straight')}
                                score={`${getXHandBaseScore('Straight')} ${t('rules.pointsUnit')}`}
                                cards={[c(3, 'clubs'), c(4, 'diamonds'), c(5, 'hearts'), c(6, 'spades'), c(7, 'clubs')]}
                            />
                            <HandExample
                                title={handName('Flush')}
                                score={`${getXHandBaseScore('Flush')} ${t('rules.pointsUnit')}`}
                                cards={[c(2, 'diamonds'), c(5, 'diamonds'), c(8, 'diamonds'), c(11, 'diamonds'), c(13, 'diamonds')]}
                            />
                            <HandExample
                                title={handName('ThreeOfAKind')}
                                score={`${getXHandBaseScore('ThreeOfAKind')} ${t('rules.pointsUnit')}`}
                                cards={[c(7, 'spades'), c(7, 'hearts'), c(7, 'clubs'), c(2, 'diamonds'), c(12, 'clubs')]}
                            />
                            <HandExample
                                title={handName('TwoPair')}
                                score={`${getXHandBaseScore('TwoPair')} ${t('rules.pointsUnit')}`}
                                cards={[c(11, 'hearts'), c(11, 'clubs'), c(4, 'diamonds'), c(4, 'spades'), c(14, 'clubs')]}
                            />
                            <HandExample
                                title={handName('OnePair')}
                                score={`${getXHandBaseScore('OnePair')} ${t('rules.pointsUnit')}`}
                                cards={[c(9, 'clubs'), c(9, 'spades'), c(2, 'hearts'), c(5, 'diamonds'), c(13, 'clubs')]}
                            />
                            <HandExample
                                title={handName('HighCard')}
                                score={`${getXHandBaseScore('HighCard')} ${t('rules.pointsUnit')}`}
                                cards={[c(14, 'spades'), c(11, 'hearts'), c(8, 'clubs'), c(5, 'diamonds'), c(2, 'spades')]}
                            />
                        </ol>
                    </article>}
                </div>
            </div>
        </Modal>
    );
}
