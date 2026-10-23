import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { gsap } from 'gsap';
import { ResultNumber } from './ResultNumber';
import { setResultNumber, countResultNumber, useResultScene } from './resultMotion';
import { resultXpProgress } from '../logic/resultProgress';
import { Coins, Flame, Trophy, TrendingUp } from 'lucide-react';
import { advancedAchievements, type MatchRewards as Rewards } from '../logic/matchRewards';
import { COSMETICS } from '../logic/progression';
import { LetteringText } from './LetteringText';
import { useI18n } from '../i18n';
import './MatchRewards.css';

export function MatchRewards({ rewards, error, onRetry }: { rewards: Rewards | null; error?: boolean; onRetry?: () => void }) {
    if (!rewards) return <div className="match-rewards-status" role="status"><LetteringText>{error ? 'Rewards unavailable' : 'Saving rewards…'}</LetteringText>{error && onRetry && <button onClick={onRetry}><LetteringText>RETRY</LetteringText></button>}</div>;
    return <SavedMatchRewards key={rewards.matchId} rewards={rewards} />;
}

function SavedMatchRewards({ rewards }: { rewards: Rewards }) {
    const { t } = useI18n();
    const root = useRef<HTMLElement>(null);
    const timeline = useRef<gsap.core.Timeline | null>(null);
    const { skipped, play, finish } = useResultScene();
    const skippedRef = useRef(skipped);
    useLayoutEffect(() => { skippedRef.current = skipped; }, [skipped]);
    useLayoutEffect(() => {
        const media = gsap.matchMedia();
        media.add({ reduced: '(prefers-reduced-motion: reduce)', full: '(prefers-reduced-motion: no-preference)' }, context => {
            const element = root.current!;
            const done = () => {
                element.querySelectorAll<HTMLElement>('[data-number-to]').forEach(number => setResultNumber(number, Number(number.dataset.numberTo)));
                element.querySelector<HTMLElement>('.reward-xp-fill')!.style.transform = `scaleX(${resultXpProgress(rewards.xp.new, rewards.level.old, rewards.level.new).fraction})`;
            };
            if (context.conditions?.reduced || skippedRef.current) { done(); finish(); return; }
            const tl = gsap.timeline({ onComplete: finish });
            timeline.current = tl;
            const totals = element.querySelectorAll('.reward-totals > div');
            const milestones = element.querySelectorAll('.reward-level-up, .reward-cosmetics > div, .achievement-earned');
            const supporting = element.querySelectorAll('.reward-bonuses, .reward-challenge, .result-achievement:not(.achievement-earned)');
            tl.from(totals, { autoAlpha: 0, y: 14, duration: 0.28, stagger: 0.18 }, 1.05);
            tl.from(element.querySelector('.reward-xp-track'), { autoAlpha: 0, duration: 0.25 }, 1.6);
            tl.from(supporting, { autoAlpha: 0, duration: 0.25, stagger: 0.06 }, 2.7);
            tl.from(milestones, { autoAlpha: 0, scale: 0.96, y: 8, duration: 0.38, stagger: 0.2, ease: 'back.out(1.4)' }, 2.85);
            element.querySelectorAll<HTMLElement>('.reward-totals [data-number-to]').forEach((number, index) => {
                countResultNumber(tl, number, 1.15 + index * 0.18, index === 2 ? 1.05 : 0.6);
            });
            const xp = { value: rewards.xp.old };
            const levelNumber = element.querySelector<HTMLElement>('.reward-level [data-number-to]')!;
            const fill = element.querySelector<HTMLElement>('.reward-xp-fill')!;
            const updateXp = () => {
                const progress = resultXpProgress(xp.value, rewards.level.old, rewards.level.new);
                setResultNumber(levelNumber, progress.level);
                fill.style.transform = `scaleX(${progress.fraction})`;
            };
            updateXp();
            tl.to(xp, { value: rewards.xp.new, duration: 1.05, ease: 'none', onUpdate: updateXp }, 1.6);
            tl.call(() => play('reveal', 0.22), [], 1.05);
            for (let tick = 0; tick < 12; tick++) tl.call(() => play('tick', 0.12), [], 1.6 + tick * 0.075);
            const spotlights = element.closest('.result-scene')!.querySelectorAll<HTMLElement>('.result-spotlight');
            spotlights.forEach((spotlight, index) => {
                const at = 2.85 + index * 1.45;
                tl.fromTo(spotlight, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 }, at);
                tl.fromTo(spotlight.firstElementChild, { scale: 0.9, y: 12 }, { scale: 1, y: 0, duration: 0.35, ease: 'back.out(1.5)' }, at);
                tl.call(() => play(index === 0 && rewards.level.new > rewards.level.old ? 'level' : 'unlock', 0.34), [], at);
                tl.to(spotlight, { autoAlpha: 0, duration: 0.2 }, at + 1.18);
            });
            return () => { timeline.current = null; };
        }, root);
        return () => media.revert();
    }, [rewards, play, finish]);
    useLayoutEffect(() => {
        if (!skipped) return;
        timeline.current?.progress(1, true).pause();
        root.current?.querySelectorAll<HTMLElement>('[data-number-to]').forEach(el => setResultNumber(el, Number(el.dataset.numberTo)));
        const fill = root.current?.querySelector<HTMLElement>('.reward-xp-fill');
        if (fill) fill.style.transform = `scaleX(${resultXpProgress(rewards.xp.new, rewards.level.old, rewards.level.new).fraction})`;
    }, [skipped, rewards]);
    const progress = advancedAchievements(rewards);
    const challengeProgress = rewards.after.wins % 3;
    return <section ref={root} className="match-rewards" aria-label="Match rewards" aria-live="polite">
        <div className="reward-totals" style={{ '--reward-number-chars': Math.max(...[rewards.rating.change, rewards.coins.change, rewards.xp.change].map(n => String(Math.abs(n)).length + 1)) } as CSSProperties}>
            <div><span><TrendingUp size={16} aria-hidden="true" /><LetteringText>{rewards.mode === 'bot' ? 'AI RATING' : 'RATING'}</LetteringText></span><strong className={rewards.rating.change < 0 ? 'reward-negative' : ''}><ResultNumber to={rewards.rating.change} signed /></strong><small><LetteringText>{`${rewards.rating.old} → ${rewards.rating.new}`}</LetteringText></small></div>
            <div><span><Coins size={16} aria-hidden="true" /><LetteringText>COINS</LetteringText></span><strong><ResultNumber to={rewards.coins.change} signed /></strong><small><LetteringText>{`${rewards.coins.new}`}</LetteringText></small></div>
            <div><span><LetteringText>XP</LetteringText></span><strong><ResultNumber to={rewards.xp.change} signed /></strong><small><LetteringText>{`${rewards.xp.new} XP`}</LetteringText></small></div>
        </div>
        <div className="reward-xp-track">
            <span className="reward-level"><LetteringText>LV</LetteringText> <ResultNumber from={rewards.level.old} to={rewards.level.new} /></span>
            <div className="reward-xp-bar" role="progressbar" aria-label="Level XP" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(resultXpProgress(rewards.xp.new, rewards.level.old, rewards.level.new).fraction * 100)}><span className="reward-xp-fill" /></div>
        </div>
        {rewards.level.new > rewards.level.old && <div className="reward-level-up">
            <TrendingUp size={28} aria-hidden="true" />
            <div><strong><LetteringText>LEVEL UP</LetteringText></strong><span><LetteringText>{`LV ${rewards.level.old} → ${rewards.level.new}`}</LetteringText></span></div>
            <span><Coins size={16} aria-hidden="true" /><LetteringText>{`＋${rewards.breakdown.levelUp ?? 0}`}</LetteringText></span>
        </div>}
        <div className="reward-bonuses">
            <span><LetteringText>{`MATCH ＋${rewards.breakdown.base}`}</LetteringText></span>
            {rewards.breakdown.margin > 0 && <span><LetteringText>{`SCORE GAP ＋${rewards.breakdown.margin}`}</LetteringText></span>}
            {rewards.after.currentWinStreak > 1 && <span><Flame size={14} aria-hidden="true" /><LetteringText>{`${rewards.after.currentWinStreak} WIN STREAK ＋${rewards.breakdown.streak}`}</LetteringText></span>}
            {rewards.breakdown.challenge > 0 && <span><Trophy size={14} aria-hidden="true" /><LetteringText>{`3 WINS ＋${rewards.breakdown.challenge}`}</LetteringText></span>}
        </div>
        <div className="reward-challenge"><span><LetteringText>3 WINS</LetteringText></span><progress max={3} value={rewards.breakdown.challenge > 0 ? 3 : challengeProgress} aria-label="Three-win reward" /><span><LetteringText>{rewards.breakdown.challenge > 0 ? '3 / 3' : `${challengeProgress} / 3`}</LetteringText></span></div>
        {(rewards.cosmetics?.length ?? 0) > 0 && <div className="reward-cosmetics">{rewards.cosmetics!.map(id => {
            const item = COSMETICS.find(c => c.id === id);
            return item && <div key={id}><Trophy size={16} aria-hidden="true" /><LetteringText>{`${item.kind.toUpperCase()} · ${item.name}`}</LetteringText></div>;
        })}</div>}
        {progress.length > 0 && <div className="result-achievements">
            {progress.map(row => <div className={`result-achievement ${rewards.unlocked.includes(row.type) ? 'achievement-earned' : ''}`} key={row.type}>
                <div><span>{rewards.unlocked.includes(row.type) && <Trophy size={15} aria-hidden="true" />}<LetteringText>{t(`achievement.${row.type}`)}</LetteringText></span><small><LetteringText>{rewards.unlocked.includes(row.type) ? 'UNLOCKED' : `${row.progress!.current} / ${row.progress!.target}`}</LetteringText></small></div>
                {rewards.achievementRewards?.find(a => a.id === row.type) && <small><LetteringText>{`＋${rewards.achievementRewards.find(a => a.id === row.type)!.coins} COINS / ＋${rewards.achievementRewards.find(a => a.id === row.type)!.xp} XP`}</LetteringText></small>}
                {row.progress && <progress max={row.progress.target} value={row.progress.current} aria-label={t(`achievement.${row.type}`)} />}
            </div>)}
        </div>}
    </section>;
}
