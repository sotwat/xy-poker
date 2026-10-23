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
            <div className="result-spotlight-card"><TrendingUp /><strong><LetteringText>LEVEL UP</LetteringText></strong><b><LetteringText>{`LV ${rewards.level.new}`}</LetteringText></b><span><LetteringText>{`＋${rewards.breakdown.levelUp ?? 0} COINS`}</LetteringText></span></div>
        </div>}
        {rewards.unlocked.length > 0 && <div className="result-spotlight">
            <div className="result-spotlight-card"><Trophy /><strong><LetteringText>ACHIEVEMENT</LetteringText></strong>
                {rewards.unlocked.slice(0, 3).map(id => <span key={id}><LetteringText>{t(`achievement.${id}`)}</LetteringText></span>)}
                {rewards.unlocked.length > 3 && <small><LetteringText>{`＋${rewards.unlocked.length - 3}`}</LetteringText></small>}
            </div>
        </div>}
        {cosmetics.length > 0 && <div className="result-spotlight">
            <div className="result-spotlight-card"><Award /><strong><LetteringText>UNLOCKED</LetteringText></strong>
                {cosmetics.slice(0, 3).map(item => <span key={item.id}><LetteringText>{`${item.kind.toUpperCase()} · ${item.name}`}</LetteringText></span>)}
                {cosmetics.length > 3 && <small><LetteringText>{`＋${cosmetics.length - 3}`}</LetteringText></small>}
            </div>
        </div>}
    </div>;
}
