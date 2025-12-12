import React from 'react';
import './RulesModal.css';
import { Card } from './Card';
import type { Suit, Rank } from '../logic/types';

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
    return (
        <div className="rules-overlay" onClick={onClose}>
            <div className="rules-content" onClick={e => e.stopPropagation()}>
                <button className="close-btn" onClick={onClose}>×</button>
                <h2>How to Play "XY Poker"</h2>

                <div className="rules-scroll-area">
                    <section>
                        <h3>🏆 Goal</h3>
                        <p>Build the strongest <strong>Poker Hands (Rows)</strong> and match <strong>Dice Values (Columns)</strong> to score points.</p>
                    </section>

                    <section>
                        <h3>🎲 Game Flow</h3>
                        <ul>
                            <li><strong>Turns:</strong> Players take turns placing <strong>1 Card</strong> from their hand onto the <strong>5x3 Grid</strong>.</li>
                            <li><strong>X-Axis (Rows):</strong> The bottom row (Row 3, 5 cards) forms a standard Poker Hand. Stronger hand wins bonus points.</li>
                            <li><strong>Y-Axis (Columns):</strong> Each of the 5 columns (3 cards vertical) forms a "3-Card Hand". The strength is multiplied by the column's <strong>Dice Value</strong>.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>✨ Pure vs Normal</h3>
                        <p>There are two types of 3-card hands in the Y-Axis:</p>
                        <ul>
                            <li><strong>Pure (Stronger):</strong>
                                <ul>
                                    <li><strong>Straight:</strong> Ranks must be ordered (e.g., 3-4-5).</li>
                                    <li><strong>Pair:</strong> Cards must be adjacent (e.g., 5-5-9 or 9-5-5, but NOT 5-9-5).</li>
                                </ul>
                            </li>
                            <li><strong>Normal (Weaker):</strong> Any other valid combination (e.g., 3-5-4 Straight, or 5-9-5 Split Pair).</li>
                        </ul>
                    </section>

                    <section>
                        <h3>🏆 Hand Rankings (Strongest to Weakest)</h3>
                        <div className="rankings-grid">
                            {/* X-AXIS HANDS */}
                            <div className="ranking-column">
                                <h4>X-Axis (Horizontal - 5 Cards)</h4>
                                <div className="hand-list-visual">
                                    <HandExample
                                        title="Royal Flush"
                                        cards={[c(10, 'spades'), c(11, 'spades'), c(12, 'spades'), c(13, 'spades'), c(14, 'spades')]}
                                    />
                                    <HandExample
                                        title="Straight Flush"
                                        cards={[c(5, 'hearts'), c(6, 'hearts'), c(7, 'hearts'), c(8, 'hearts'), c(9, 'hearts')]}
                                    />
                                    <HandExample
                                        title="Four of a Kind"
                                        cards={[c(8, 'clubs'), c(8, 'diamonds'), c(8, 'hearts'), c(8, 'spades'), c(13, 'clubs')]}
                                    />
                                    <HandExample
                                        title="Full House"
                                        cards={[c(12, 'diamonds'), c(12, 'clubs'), c(12, 'hearts'), c(9, 'spades'), c(9, 'clubs')]}
                                    />
                                    <HandExample
                                        title="Flush"
                                        cards={[c(2, 'diamonds'), c(5, 'diamonds'), c(8, 'diamonds'), c(11, 'diamonds'), c(13, 'diamonds')]}
                                    />
                                    <HandExample
                                        title="Straight"
                                        cards={[c(3, 'clubs'), c(4, 'diamonds'), c(5, 'hearts'), c(6, 'spades'), c(7, 'clubs')]}
                                    />
                                    <HandExample
                                        title="Three of a Kind"
                                        cards={[c(7, 'spades'), c(7, 'hearts'), c(7, 'clubs'), c(2, 'diamonds'), c(12, 'clubs')]}
                                    />
                                    <HandExample
                                        title="Two Pair"
                                        cards={[c(11, 'hearts'), c(11, 'clubs'), c(4, 'diamonds'), c(4, 'spades'), c(14, 'clubs')]}
                                    />
                                    <HandExample
                                        title="One Pair"
                                        cards={[c(9, 'clubs'), c(9, 'spades'), c(2, 'hearts'), c(5, 'diamonds'), c(13, 'clubs')]}
                                    />
                                    <HandExample
                                        title="High Card"
                                        cards={[c(14, 'spades'), c(11, 'hearts'), c(8, 'clubs'), c(5, 'diamonds'), c(2, 'spades')]}
                                    />
                                </div>
                            </div>

                            {/* Y-AXIS HANDS */}
                            <div className="ranking-column">
                                <h4>Y-Axis (Vertical - 3 Cards)</h4>
                                <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>
                                    Cards shown Left to Right = Top to Bottom (Row 1, 2, 3)
                                </p>
                                <div className="hand-list-visual">
                                    <HandExample
                                        title="Pure Straight Flush"
                                        note="Ordered"
                                        cards={[c(5, 'hearts'), c(6, 'hearts'), c(7, 'hearts')]}
                                    />
                                    <HandExample
                                        title="Three of a Kind"
                                        cards={[c(8, 'clubs'), c(8, 'diamonds'), c(8, 'spades')]}
                                    />
                                    <HandExample
                                        title="Straight Flush"
                                        note="Unordered"
                                        cards={[c(7, 'spades'), c(9, 'spades'), c(8, 'spades')]}
                                    />
                                    <HandExample
                                        title="Pure Straight"
                                        note="Ordered"
                                        cards={[c(3, 'clubs'), c(4, 'hearts'), c(5, 'diamonds')]}
                                    />
                                    <HandExample
                                        title="Flush"
                                        cards={[c(2, 'clubs'), c(9, 'clubs'), c(11, 'clubs')]}
                                    />
                                    <HandExample
                                        title="Pure One Pair"
                                        note="Adjacent"
                                        cards={[c(5, 'hearts'), c(5, 'clubs'), c(9, 'diamonds')]}
                                    />
                                    <HandExample
                                        title="Straight"
                                        note="Unordered"
                                        cards={[c(4, 'diamonds'), c(6, 'spades'), c(5, 'clubs')]}
                                    />
                                    <HandExample
                                        title="One Pair"
                                        note="Split"
                                        cards={[c(8, 'clubs'), c(12, 'diamonds'), c(8, 'spades')]}
                                    />
                                    <HandExample
                                        title="High Card"
                                        cards={[c(13, 'hearts'), c(5, 'clubs'), c(2, 'diamonds')]}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div >
    );
};
