import { useState, useEffect } from 'react';
import type { Card as CardType, CardSkin, GameState } from '../logic/types';
import { Card } from './Card';
import './ScoringOverlay.css';

interface ScoringOverlayProps {
    gameState: GameState;
    step: number; // 0-4 (Cols), 5 (Row)
    results: Array<{ winner: string; type: string | null; p1Score?: number; p2Score?: number }>;
    rowResult: { winner: string; type: string | null; p1Score?: number; p2Score?: number };
    cardSkin: CardSkin;
    isOnlineGame: boolean;
    playerRole: 'host' | 'guest' | null;
}

export const ScoringOverlay: React.FC<ScoringOverlayProps> = ({
    gameState,
    step,
    results,
    rowResult,
    cardSkin,
    isOnlineGame,
    playerRole
}) => {
    // Helper to get cards for current step
    const getCards = () => {
        const { players } = gameState;
        const p1 = players[0];
        const p2 = players[1];

        if (step <= 4) {
            const colIndex = 4 - step; // 4, 3, 2, 1, 0
            const p1Cards = [p1.board[0][colIndex]!, p1.board[1][colIndex]!, p1.board[2][colIndex]!];
            const p2Cards = [p2.board[0][colIndex]!, p2.board[1][colIndex]!, p2.board[2][colIndex]!];
            return { p1Cards, p2Cards, result: results[step], title: `COLUMN ${colIndex + 1}` };
        } else {
            // Row 2 (X Hand)
            const p1Cards = p1.board[2] as CardType[];
            const p2Cards = p2.board[2] as CardType[];
            return { p1Cards, p2Cards, result: rowResult, title: 'EXTRA HAND (ROW 3)' };
        }
    };

    const { p1Cards, p2Cards, result, title } = getCards();

    // Determine which set to highlight
    // If draw, highlight both? Or neither?
    // Let's highlight Winner.
    // Use playerRole to determine "My Cards" vs "Opponent Cards" for labeling?
    // Actually, visually P1 is usually Bottom (Local) or "Me" (Online Host).
    // Wait, in Online:
    // Host (P1) is Bottom. Guest (P2) is Top.
    // Guest (P2) sees P2 at Bottom. P1 at Top.
    // SharedBoard flips the board rendering based on Role.
    // Here we want to respect that perspective.

    const isP1Me = !isOnlineGame || playerRole === 'host';
    const myId = isP1Me ? 'p1' : 'p2';
    const oppId = isP1Me ? 'p2' : 'p1';

    const myCards = isP1Me ? p1Cards : p2Cards;
    const oppCards = isP1Me ? p2Cards : p1Cards;

    // Result winner is 'p1' or 'p2'.
    const isMeWinner = result.winner === myId;
    const isOppWinner = result.winner === oppId;
    // const isDraw = result.winner === 'draw';

    const winnerCards = isMeWinner ? myCards : (isOppWinner ? oppCards : []);
    const winningHandName = result.type ? result.type.replace(/([A-Z])/g, ' $1').trim() : '';
    const winnerLabel = isMeWinner ? 'YOU WIN' : (isOppWinner ? (isOnlineGame ? 'OPPONENT WINS' : 'AI WINS') : 'DRAW');
    const winnerColor = isMeWinner ? '#4caf50' : (isOppWinner ? '#f44336' : '#999');

    const [animateIn, setAnimateIn] = useState(false);

    useEffect(() => {
        setAnimateIn(false);
        requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
    }, [step]);

    return (
        <div className="scoring-overlay">
            <div className="scoring-backdrop" />

            <div className={`scoring-content ${animateIn ? 'animate-in' : ''}`}>
                <h2 className="scoring-title">{title}</h2>

                <div className="battle-stage">
                    {/* Only show WINNER cards for focus? Or show VS? */}
                    {/* User requested: "Winning cards pop up to center" */}

                    {winnerCards.length > 0 ? (
                        <div className="winner-showcase">
                            <h3 className="winner-label" style={{ color: winnerColor }}>{winnerLabel}</h3>
                            <div className="cards-row">
                                {winnerCards.map(c => (
                                    <div key={c.id} className="showcase-card">
                                        {/* Force reveal by cloning and setting isHidden to false */}
                                        <Card card={{ ...c, isHidden: false }} isHidden={false} skin={cardSkin} />
                                    </div>
                                ))}
                            </div>
                            <div className="hand-label">
                                <span className="hand-name">{winningHandName}</span>
                                <span className="hand-score">WIN!!</span>
                            </div>
                        </div>
                    ) : (
                        <div className="draw-showcase">
                            <h1>DRAW</h1>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
