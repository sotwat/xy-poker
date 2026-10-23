import { LetteringText } from './LetteringText';
import { Modal } from './Modal';
import { MatchRewards } from './MatchRewards';
import type { MatchRewards as Rewards } from '../logic/matchRewards';
import React from 'react';
import { Trophy, Minus, Swords } from 'lucide-react';
import { ResultScene } from './ResultScene';
import { ResultNumber } from './ResultNumber';
import type { GameState, Card } from '../logic/types';
import { evaluateYHand, evaluateXHand } from '../logic/evaluation';
import { calculateXHandScores } from '../logic/scoring';
import { playClickSound } from '../utils/sound';
import './GameResult.css';
import { useI18n } from '../i18n';

interface GameResultProps {
    gameState: GameState;
    viewerPlayerIndex?: number;
    rewards?: Rewards | null;
    rewardError?: boolean;
    onRetryRewards?: () => void;
    onRestart: () => void;
    onClose: () => void;
    onViewBoard: () => void; // New prop
    backLabel: string;
    p1Name?: string;
    p2Name?: string;
    ratingUpdates?: {
        p1: { old: number, new: number, change: number };
        p2: { old: number, new: number, change: number };
    } | null;
}

export const GameResult: React.FC<GameResultProps> = ({
    gameState,
    viewerPlayerIndex = 0,
    onRestart,
    onClose,
    onViewBoard,
    backLabel,
    p1Name = 'Player 1',
    p2Name = 'Player 2',
    ratingUpdates, rewards, rewardError, onRetryRewards
}) => {
    const { t, handName } = useI18n();
    const { players, winner } = gameState;
    const p1 = players[0];
    const p2 = players[1];
    const dice = players[0].dice;

    const outcome = winner === 'draw' ? 'draw' : winner === `p${viewerPlayerIndex + 1}` ? 'win' : 'loss';

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
            p1Hand: handName(p1Res.type),
            p2Hand: handName(p2Res.type),
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


    return (
        <Modal className="game-result-overlay" label={t('game.showDetails')} onClose={onViewBoard}>
            <ResultScene outcome={outcome} rewards={rewards}>
                <div className="result-scroll">
                <div className="result-outcome">
                    {outcome === 'win' ? <Trophy aria-hidden="true" /> : outcome === 'draw' ? <Minus aria-hidden="true" /> : <Swords aria-hidden="true" />}
                    <strong><LetteringText>{outcome === 'win' ? 'YOU WIN' : outcome === 'loss' ? 'YOU LOSE' : 'DRAW'}</LetteringText></strong>
                    {winner !== 'draw' && <small><LetteringText>{winner === 'p1' ? p1Name : p2Name}</LetteringText></small>}
                </div>

                <div className="final-scores">
                    <div className={`score-box p1 ${winner === 'p1' ? 'winner-box' : ''}`}>
                        <h3>{p1Name}</h3>
                        <div className="score-val"><ResultNumber to={p1.score} /></div>
                        <div className="bonus-val">{t('result.bonuses', { count: p1.bonusesClaimed })}</div>
                        {ratingUpdates && !rewards && ratingUpdates.p1 && (
                            <div className="rating-update">
                                <div>{t('common.rating')}</div>
                                <div className="rating-values">
                                    {ratingUpdates.p1.old} → <span className="rating-new">{ratingUpdates.p1.new}</span>
                                </div>
                                <div className={`rating-change ${ratingUpdates.p1.change >= 0 ? 'pos' : 'neg'}`}>
                                    {ratingUpdates.p1.change >= 0 ? '+' : ''}{ratingUpdates.p1.change}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className={`score-box p2 ${winner === 'p2' ? 'winner-box' : ''}`}>
                        <h3>{p2Name}</h3>
                        <div className="score-val"><ResultNumber to={p2.score} /></div>
                        <div className="bonus-val">{t('result.bonuses', { count: p2.bonusesClaimed })}</div>
                        {ratingUpdates && !rewards && ratingUpdates.p2 && (
                            <div className="rating-update">
                                <div>{t('common.rating')}</div>
                                <div className="rating-values">
                                    {ratingUpdates.p2.old} → <span className="rating-new">{ratingUpdates.p2.new}</span>
                                </div>
                                <div className={`rating-change ${ratingUpdates.p2.change >= 0 ? 'pos' : 'neg'}`}>
                                    {ratingUpdates.p2.change >= 0 ? '+' : ''}{ratingUpdates.p2.change}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <MatchRewards rewards={rewards ?? null} error={rewardError} onRetry={onRetryRewards} />

                <details className="result-hand-details"><summary><LetteringText>HANDS</LetteringText></summary>
                <div className="results-table">
                    <div className="table-header">
                        <div>{t('result.dice')}</div>
                        <div className="result-player-heading player-one-heading">{p1Name}</div>
                        <div className="result-player-heading player-two-heading">{p2Name}</div>
                    </div>
                    {columnResults.map((res, idx) => (
                        <div key={idx} className="table-row">
                            <div className="dice-val">{res.dice}</div>
                            <div className={`hand-name player-one-hand ${res.winner === 'p1' ? 'winning-hand' : ''}`}>{res.p1Hand}</div>
                            <div className={`hand-name player-two-hand ${res.winner === 'p2' ? 'winning-hand' : ''}`}>{res.p2Hand}</div>
                        </div>
                    ))}

                    <div className="table-divider"></div>

                    <div
                        className="table-row x-hand-row"
                        role="row"
                        aria-label={`${t('result.xHand')}: ${p1Name} ${handName(p1XRes.type)} ${t('result.points', { points: p1XScore })}; ${p2Name} ${handName(p2XRes.type)} ${t('result.points', { points: p2XScore })}`}
                    >
                        <div className="x-hand-label">{t('result.xHand')}</div>
                        <div className={`hand-name player-one-hand ${xWinner === 'p1' ? 'winning-hand' : ''}`}>
                            {handName(p1XRes.type)} <span className="score-detail">({p1XScore})</span>
                        </div>
                        <div className={`hand-name player-two-hand ${xWinner === 'p2' ? 'winning-hand' : ''}`}>
                            {handName(p2XRes.type)} <span className="score-detail">({p2XScore})</span>
                        </div>
                    </div>
                </div>

                </details>
                </div>

                <div className="button-group">
                    <button className="btn-secondary view-board-btn" onClick={() => { playClickSound(); onViewBoard(); }}>
                        <LetteringText>{t('result.viewBoard')}</LetteringText>
                    </button>
                    <button className="btn-secondary quit-btn" onClick={onClose}>
                        <LetteringText>{backLabel}</LetteringText>
                    </button>
                    <button className="btn-primary restart-btn" onClick={() => { playClickSound(); onRestart(); }}>
                        <LetteringText>{t('result.playAgain')}</LetteringText>
                    </button>
                </div>
            </ResultScene>
        </Modal>
    );
};

export function ForfeitResult({ won, rewards, error, onRetry, onClose }: { won: boolean; rewards: Rewards | null; error: boolean; onRetry: () => void; onClose: () => void }) {
    return <Modal className="game-result-overlay" label="Results" onClose={onClose}>
        <ResultScene outcome={won ? 'win' : 'loss'} rewards={rewards}>
            <div className="result-scroll">
                <div className="result-outcome">{won ? <Trophy aria-hidden="true" /> : <Swords aria-hidden="true" />}<strong><LetteringText>{won ? 'YOU WIN' : 'YOU LOSE'}</LetteringText></strong></div>
                <MatchRewards rewards={rewards} error={error} onRetry={onRetry} />
            </div>
            <button className="btn-primary" onClick={onClose}><LetteringText>HOME</LetteringText></button>
        </ResultScene>
    </Modal>;
}
