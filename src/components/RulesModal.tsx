import React from 'react';
import './RulesModal.css';

interface RulesModalProps {
    onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => {
    return (
        <div className="rules-overlay" onClick={onClose}>
            <div className="rules-content" onClick={e => e.stopPropagation()}>
                <button className="close-btn" onClick={onClose}>×</button>
                <h2>How to Play "XY Poker"</h2>

                <div className="rules-scroll-area">
                    <section>
                        <h3>🏆 Goal</h3>
                        <p>Build the strongest <strong>Poker Hands (Rows)</strong> and match <strong>Dice Values (Columns)</strong> to score points. The player with the highest total score wins!</p>
                    </section>

                    <section>
                        <h3>🃏 The Board (3x5 Grid)</h3>
                        <p>Each player has a 3x5 grid. You will place cards into this grid.</p>
                        <ul className="rules-list">
                            <li><strong>X-Axis (Rows):</strong> Form 3 Poker Hands (Horizontal).</li>
                            <li><strong>Y-Axis (Columns):</strong> Match the column's Dice Value (Vertical).</li>
                        </ul>
                    </section>

                    <section>
                        <h3>🎮 Turn Flow</h3>
                        <ol>
                            <li><strong>Place:</strong> Put your selected card into any empty slot on your grid.</li>
                            <li><strong>Hidden Cards:</strong> You can place up to <strong>3 cards face down</strong> per game. These are revealed at the end, hiding your strategy from the opponent!</li>
                            <li><strong>Draw:</strong> After placing, you draw a new card automatically.</li>
                        </ol>
                    </section>

                    <section>
                        <h3>✨ Scoring</h3>
                        <div className="score-explanation">
                            <div className="score-item">
                                <strong>Horizontal (Rows):</strong>
                                <p>Standard Poker Hands (Royal Flush &gt; Straight Flush &gt; ... &gt; High Card).</p>
                                <p>Points are awarded based on hand strength.</p>
                            </div>
                            <div className="score-item">
                                <strong>Vertical (Columns):</strong>
                                <p>Each column has a Dice Value (1-6).</p>
                                <p>The player with the <strong>stronger vertical hand*</strong> wins the column multiplier!</p>
                                <p><small>*Strength is judged by how well you match the dice (e.g. number of cards matching the dice value).</small></p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
