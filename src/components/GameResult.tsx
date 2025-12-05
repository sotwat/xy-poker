import React from 'react';
import type { GameState, Card } from '../logic/types';
import { evaluateYHand, evaluateXHand } from '../logic/evaluation';
import { calculateXHandScores } from '../logic/scoring';
import './GameResult.css';

interface GameResultProps {
    gameState: GameState;
    onRestart: () => void;
    onClose: () => void;
    playerName?: string;
    opponentName?: string;
}

export const GameResult: React.FC<GameResultProps> = ({
    gameState,
    onRestart,
    onClose,
    playerName = 'Player 1',
    opponentName = 'Player 2'
}) => {
    const { players, winner } = gameState;
    const p1 = players[0];
    const p2 = players[1];
    const dice = players[0].dice; // Shared dice

    const p1Name = playerName;
    const p2Name = opponentName;

    // Helper to get readable hand name
    const getHandName = (type: string) => {
        return type.replace(/([A-Z])/g, ' $1').trim();
    };

    // Evaluate Columns (Y-Hands)
    const columnResults = Array.from({ length: 5 }).map((_, colIndex) => {
        const p1Cards = [p1.board[0][colIndex]!, p1.board[1][colIndex]!, p1.board[2][colIndex]!];
        const p2Cards = [p2.board[0][colIndex]!, p2.board[1][colIndex]!, p2.board[2][colIndex]!];

        const p1Res = evaluateYHand(p1Cards, dice[colIndex]);
        const p2Res = evaluateYHand(p2Cards, dice[colIndex]);

        let colWinner = 'draw';
        if (p1Res.rankValue > p2Res.rankValue) colWinner = 'p1';
        else if (p2Res.rankValue > p1Res.rankValue) colWinner = 'p2';
        else {
            // Tie-break with kickers
            let p1Wins = false;
            let p2Wins = false;
            for (let k = 0; k < Math.max(p1Res.kickers.length, p2Res.kickers.length); k++) {
                const k1 = p1Res.kickers[k] || 0;
                const k2 = p2Res.kickers[k] || 0;
                if (k1 > k2) { p1Wins = true; break; }
                if (k2 > k1) { p2Wins = true; break; }
            }
            if (p1Wins) colWinner = 'p1';
            else if (p2Wins) colWinner = 'p2';
        }

        return {
            dice: dice[colIndex],
            p1Hand: getHandName(p1Res.type),
            p2Hand: getHandName(p2Res.type),
            winner: colWinner
        };
    });

    // Evaluate Rows (X-Hands)
    const p1XRes = evaluateXHand(p1.board[2] as Card[]);
    const p2XRes = evaluateXHand(p2.board[2] as Card[]);

    const { p1Score: p1XScore, p2Score: p2XScore } = calculateXHandScores(p1XRes, p2XRes);

    let xWinner = 'draw';
    if (p1XScore > p2XScore) xWinner = 'p1';
    else if (p2XScore > p1XScore) xWinner = 'p2';
    // If equal, it's a draw (no +1 bonus awarded, or both got base points and are equal)


    return (
        <div className="game-result-overlay">
            <div className="game-result-modal">
                <div className="winner-announcement">
                    {winner === 'draw' ? (
                        <span className="draw-text">Draw - Tie Game!</span>
                    ) : (
                        <>
                            Winner: <span className={winner === 'p1' ? 'p1-text' : 'p2-text'}>
                                {winner === 'p1' ? p1Name : p2Name}
                            </span>!
                        </>
                    )}
                </div>

                <div className="results-table">
                    <div className="table-header">
                        <div>Column</div>
                        <div>Dice</div>
                        <div>P1</div>
                        <div>P2</div>
                        <div>Winner</div>
                    </div>
                    {columnResults.map((res, idx) => (
                        <div key={idx} className="table-row">
                            <div>{idx + 1}</div>
                            <div className="dice-val">{res.dice}</div>
                            <div className={`hand-name ${res.winner === 'p1' ? 'win' : ''}`}>{res.p1Hand}</div>
                            <div className={`hand-name ${res.winner === 'p2' ? 'win' : ''}`}>{res.p2Hand}</div>
                            <div className={`winner-col ${res.winner}`}>{res.winner.toUpperCase()}</div>
                        </div>
                    ))}

                    <div className="table-divider"></div>

                    <div className="table-row x-hand-row">
                        <div>X-Hand</div>
                        <div></div>
                        <div className={`hand-name ${xWinner === 'p1' ? 'win' : ''}`}>
                            {getHandName(p1XRes.type)} <span className="score-detail">({p1XScore})</span>
                        </div>
                        <div className={`hand-name ${xWinner === 'p2' ? 'win' : ''}`}>
                            {getHandName(p2XRes.type)} <span className="score-detail">({p2XScore})</span>
                        </div>
                        <div className={`winner-col ${xWinner}`}>{xWinner.toUpperCase()}</div>
                    </div>
                </div>

                <div className="final-scores">
                    <div className="score-box p1">
                        <h3>{p1Name}</h3>
                        <div className="score-val">{p1.score}</div>
                        <div className="bonus-val">Bonuses: {p1.bonusesClaimed}</div>
                    </div>
                    <div className="score-box p2">
                        <h3>{p2Name}</h3>
                        <div className="score-val">{p2.score}</div>
                        <div className="bonus-val">Bonuses: {p2.bonusesClaimed}</div>
                    </div>
                </div>

                <div className="button-group">
                    <button className="btn-secondary view-board-btn" onClick={onClose}>
                        View Board
                    </button>
                    <button className="btn-primary restart-btn" onClick={onRestart}>
                        Play Again
                    </button>
                </div>
            </div>
        </div>
    );
};
