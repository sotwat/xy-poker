import { Coins, Flame, Trophy, TrendingUp } from 'lucide-react';
import { advancedAchievements, type MatchRewards as Rewards } from '../logic/matchRewards';
import { LetteringText } from './LetteringText';
import { useI18n } from '../i18n';
import './MatchRewards.css';

const signed = (value: number) => `${value >= 0 ? '＋' : '−'}${Math.abs(value)}`;
export function MatchRewards({ rewards, error, onRetry }: { rewards: Rewards | null; error?: boolean; onRetry?: () => void }) {
    const { t } = useI18n();
    if (!rewards) return <div className="match-rewards-status" role="status"><LetteringText>{error ? 'Rewards unavailable' : 'Saving rewards…'}</LetteringText>{error && onRetry && <button onClick={onRetry}><LetteringText>RETRY</LetteringText></button>}</div>;
    const progress = advancedAchievements(rewards);
    const challengeProgress = rewards.after.wins % 3;
    return <section className="match-rewards" aria-label="Match rewards" aria-live="polite">
        <div className="reward-totals">
            <div><span><TrendingUp size={16} aria-hidden="true" /><LetteringText>{rewards.mode === 'bot' ? 'AI RATING' : 'RATING'}</LetteringText></span><strong className={rewards.rating.change < 0 ? 'reward-negative' : ''}><LetteringText>{signed(rewards.rating.change)}</LetteringText></strong><small><LetteringText>{`${rewards.rating.old} → ${rewards.rating.new}`}</LetteringText></small></div>
            <div><span><Coins size={16} aria-hidden="true" /><LetteringText>COINS</LetteringText></span><strong><LetteringText>{signed(rewards.coins.change)}</LetteringText></strong><small><LetteringText>{`${rewards.coins.new}`}</LetteringText></small></div>
            <div><span><LetteringText>XP</LetteringText></span><strong><LetteringText>{signed(rewards.xp.change)}</LetteringText></strong><small><LetteringText>{rewards.level.new > rewards.level.old ? `LV ${rewards.level.old} → ${rewards.level.new}` : `LV ${rewards.level.new}`}</LetteringText></small></div>
        </div>
        <div className="reward-bonuses">
            <span><LetteringText>{`MATCH ＋${rewards.breakdown.base}`}</LetteringText></span>
            {rewards.breakdown.margin > 0 && <span><LetteringText>{`SCORE GAP ＋${rewards.breakdown.margin}`}</LetteringText></span>}
            {rewards.after.currentWinStreak > 1 && <span><Flame size={14} aria-hidden="true" /><LetteringText>{`${rewards.after.currentWinStreak} WIN STREAK ＋${rewards.breakdown.streak}`}</LetteringText></span>}
            {rewards.breakdown.challenge > 0 && <span><Trophy size={14} aria-hidden="true" /><LetteringText>{`3 WINS ＋${rewards.breakdown.challenge}`}</LetteringText></span>}
        </div>
        <div className="reward-challenge"><span><LetteringText>3 WINS</LetteringText></span><progress max={3} value={rewards.breakdown.challenge > 0 ? 3 : challengeProgress} aria-label="Three-win reward" /><span><LetteringText>{rewards.breakdown.challenge > 0 ? '3 / 3' : `${challengeProgress} / 3`}</LetteringText></span></div>
        {progress.length > 0 && <div className="result-achievements">
            {progress.map(row => <div className={`result-achievement ${rewards.unlocked.includes(row.type) ? 'achievement-earned' : ''}`} key={row.type}>
                <div><span>{rewards.unlocked.includes(row.type) && <Trophy size={15} aria-hidden="true" />}<LetteringText>{t(`achievement.${row.type}`)}</LetteringText></span><small><LetteringText>{rewards.unlocked.includes(row.type) ? 'UNLOCKED' : `${row.progress!.current} / ${row.progress!.target}`}</LetteringText></small></div>
                {row.progress && <progress max={row.progress.target} value={row.progress.current} aria-label={t(`achievement.${row.type}`)} />}
            </div>)}
        </div>}
    </section>;
}
