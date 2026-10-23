import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { FastForward, Volume2, VolumeX } from 'lucide-react';
import { createResultAudio } from '../utils/resultAudio';
import { setResultNumber, countResultNumber, ResultContext } from './resultMotion';
import { ResultCelebrations } from './ResultCelebrations';
import type { MatchRewards } from '../logic/matchRewards';
import './ResultScene.css';

export function ResultScene({ outcome, children, rewards, rewardError }: { outcome: 'win' | 'loss' | 'draw'; children: ReactNode; rewards?: MatchRewards | null; rewardError?: boolean }) {
    const root = useRef<HTMLDivElement>(null);
    const intro = useRef<gsap.core.Timeline | null>(null);
    const audio = useRef<ReturnType<typeof createResultAudio> | null>(null);
    const [skipped, setSkipped] = useState(false);
    const [muted, setMuted] = useState(() => { try { return localStorage.getItem('xypoker_result_muted') === 'true'; } catch { return false; } });
    const [finished, setFinished] = useState(false);
    const muteRef = useRef(muted);
    useLayoutEffect(() => {
        const sound = createResultAudio();
        audio.current = sound;
        sound.mute(muteRef.current);
        sound.preload();
        const media = gsap.matchMedia();
        media.add({ reduced: '(prefers-reduced-motion: reduce)', full: '(prefers-reduced-motion: no-preference)' }, context => {
            const element = root.current!;
            const reduced = context.conditions?.reduced;
            const timeline = gsap.timeline();
            intro.current = timeline;
            timeline.call(() => sound.play(outcome), [], 0.08);
            if (reduced) {
                element.querySelectorAll<HTMLElement>('.final-scores [data-number-to]').forEach(number => setResultNumber(number, Number(number.dataset.numberTo)));
            } else {
                timeline.from(element.querySelector('.result-outcome'), { autoAlpha: 0, scale: 1.16, y: -14, duration: 0.45, ease: 'power3.out' }, 0);
                timeline.from(element.querySelectorAll('.score-box'), { autoAlpha: 0, y: 16, duration: 0.32, stagger: 0.08 }, 0.25);
                element.querySelectorAll<HTMLElement>('.final-scores [data-number-to]').forEach((number, index) => countResultNumber(timeline, number, 0.38, 0.65, index === 0 ? () => sound.play('tick', 0.13) : undefined));
            }
        }, root);
        const hide = () => { if (document.hidden) { sound.stop(); setSkipped(true); } };
        document.addEventListener('visibilitychange', hide);
        return () => { document.removeEventListener('visibilitychange', hide); media.revert(); sound.dispose(); audio.current = null; };
    }, [outcome]);
    useLayoutEffect(() => {
        if (!skipped) return;
        intro.current?.progress(1, true).pause();
        root.current?.querySelectorAll<HTMLElement>('.final-scores [data-number-to]').forEach(el => setResultNumber(el, Number(el.dataset.numberTo)));
        audio.current?.stop();
    }, [skipped]);
    const play = useCallback<ReturnType<typeof createResultAudio>['play']>((name, volume) => audio.current?.play(name, volume), []);
    const finish = useCallback(() => setFinished(true), []);
    const skip = () => { audio.current?.stop(); setSkipped(true); setFinished(true); };
    return <ResultContext.Provider value={{ skipped, play, finish }}>
        <div ref={root} className={`game-result-modal result-scene result-${outcome}`} onClick={event => {
            if (!(event.target as HTMLElement).closest('button, summary, a, input') && !finished) skip();
        }}>
            <div className="result-tools">
                <button aria-label={muted ? 'Unmute result sound' : 'Mute result sound'} aria-pressed={muted} onClick={() => {
                    const value = !muted; muteRef.current = value; setMuted(value); audio.current?.mute(value);
                    try { localStorage.setItem('xypoker_result_muted', String(value)); } catch { /* Storage can be unavailable. */ }
                }}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
                {!skipped && !finished && !rewardError && <button onClick={skip}><FastForward size={15} />SKIP</button>}
            </div>
            {children}
            <ResultCelebrations rewards={rewards} />
        </div>
    </ResultContext.Provider>;
}
