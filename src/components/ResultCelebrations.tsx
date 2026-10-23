import { Award, Trophy, TrendingUp } from 'lucide-react';
import type { MatchRewards } from '../logic/matchRewards';
import { COSMETICS } from '../logic/progression';
import { useI18n } from '../i18n';
import { LetteringText } from './LetteringText';

export function ResultCelebrations({ rewards }: { rewards?: MatchRewards | null }) {
    const { t } = useI18n();
    if (!rewards) return null;
    const cosmetics = (rewards.cosmetics ?? []).map(id => COSMETICS.find(c => c.id === id)).filter(c => c !== undefined);
    const leveled = rewards.level.new > rewards.level.old;
    return <div className="result-spotlights" aria-hidden="true">
        {leveled && <div className="result-spotlight">
            <div className="result-spotlight-card"><TrendingUp /><strong><LetteringText>LEVEL UP</LetteringText></strong><b>{`LV ${rewards.level.new}`}</b><span>{`＋${rewards.breakdown.levelUp ?? 0} COINS`}</span></div>
        </div>}
        {rewards.unlocked.length > 0 && <div className="result-spotlight">
            <div className="result-spotlight-card"><Trophy /><strong><LetteringText>ACHIEVEMENT</LetteringText></strong>
                {rewards.unlocked.slice(0, 3).map(id => <span key={id}>{t(`achievement.${id}`)}</span>)}
                {rewards.unlocked.length > 3 && <small>{`＋${rewards.unlocked.length - 3}`}</small>}
            </div>
        </div>}
        {cosmetics.length > 0 && <div className="result-spotlight">
            <div className="result-spotlight-card"><Award /><strong><LetteringText>UNLOCKED</LetteringText></strong>
                {cosmetics.slice(0, 3).map(item => <span key={item.id}>{`${item.kind.toUpperCase()} · ${item.name}`}</span>)}
                {cosmetics.length > 3 && <small>{`＋${cosmetics.length - 3}`}</small>}
            </div>
        </div>}
    </div>;
}
