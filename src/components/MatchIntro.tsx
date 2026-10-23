import { useLayoutEffect, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { matchWinRate } from '../logic/matchStats';
import type { MatchPlayerStats } from '../logic/matchStats';
import { playCoinTossSound } from '../utils/sound';
import './MatchIntro.css';

interface MatchIntroProps {
    names: [string, string];
    stats: [MatchPlayerStats | null, MatchPlayerStats | null];
    mySeat: number;
    online: boolean;
    winner: 0 | 1;
    onComplete: () => void;
}

export function MatchIntro({ names, stats, mySeat, online, winner, onComplete }: MatchIntroProps) {
    const scope = useRef<HTMLDivElement>(null);
    const complete = useRef(onComplete);
    useEffect(() => { complete.current = onComplete; }, [onComplete]);
    useLayoutEffect(() => {
        let finished = false;
        let stopSound: (() => void) | undefined;
        const finish = () => {
            if (finished) return;
            finished = true;
            complete.current();
        };
        const media = gsap.matchMedia();
        const context = gsap.context(() => {
            media.add({ reduced: '(prefers-reduced-motion: reduce)', animated: '(prefers-reduced-motion: no-preference)' }, ({ conditions }) => {
                const sprite = scope.current?.querySelector<HTMLElement>('.minted-coin');
                if (!sprite) return;
                const rotation = { frame: finished || conditions?.reduced ? winner * 24 : 0 };
                const drawFrame = () => {
                    const frame = ((Math.round(rotation.frame) % 48) + 48) % 48;
                    sprite.style.backgroundPosition = `${frame % 8 * 100 / 7}% ${Math.floor(frame / 8) * 100 / 5}%`;
                };
                drawFrame();
                const stage = scope.current?.querySelector<HTMLElement>('.minted-coin-stage');
                const lift = Math.max(4, Math.min(56, (stage?.clientHeight ?? 226) / 2 - sprite.clientWidth * .46 - 8));
                const timeline = gsap.timeline({ onComplete: finish });
                if (conditions?.reduced || finished) {
                    gsap.set('.minted-coin-flight', { y: 0, rotation: 0, scale: 1, opacity: 1 });
                    gsap.set('.coin-ground-shadow', { scale: 1, opacity: .6 });
                    gsap.set('.match-contender', { opacity: 1, x: 0 });
                    stopSound?.();
                    timeline.to({}, { duration: finished ? 0 : .7 });
                    return;
                }
                timeline.addLabel('match', 0)
                    .fromTo('.match-contender', { opacity: 0, x: i => i ? 24 : -24 }, { opacity: 1, x: 0, duration: .32, stagger: .1, ease: 'power2.out' }, 'match')
                    .set('.minted-coin-flight', { y: 42, scale: .75, opacity: 0 }, 0)
                    .set('.coin-ground-shadow', { scale: .65, opacity: .5 }, 0)
                    .addLabel('launch', .45)
                    .call(() => { stopSound = playCoinTossSound(); }, [], 'launch')
                    .to('.minted-coin-flight', { opacity: 1, duration: .1 }, 'launch')
                    .to('.minted-coin-flight', { y: -lift, scale: 1.18, rotation: -12, duration: .68, ease: 'power2.out' }, 'launch')
                    .to('.coin-ground-shadow', { scale: .42, opacity: .18, duration: .68 }, 'launch')
                    .to(rotation, { frame: winner * 24 + 192, duration: 1.12, ease: 'none', onUpdate: drawFrame }, 'launch')
                    .addLabel('landing', 1.57)
                    .to('.minted-coin-flight', { y: 0, scale: 1, rotation: 0, duration: .44, ease: 'power2.in' }, 1.13)
                    .to('.coin-ground-shadow', { scale: 1, opacity: .65, duration: .44 }, 1.13)
                    .to('.minted-coin-flight', { y: -14, duration: .12, ease: 'power2.out' }, 'landing')
                    .to('.minted-coin-flight', { y: 0, duration: .18, ease: 'power2.in' })
                    .fromTo('.coin-landing-ring', { opacity: .55, scale: .75 }, { opacity: 0, scale: 1.5, duration: .45, ease: 'power2.out' }, 'landing')
                    .to({}, { duration: .4 });
            });
        }, scope);
        return () => { stopSound?.(); media.revert(); context.revert(); };
    }, [winner]);

    return <div className="match-intro" ref={scope}>
        <div className="match-contenders">
            {([mySeat, 1 - mySeat]).map(seat => {
                const s = stats[seat];
                const computer = !online && seat === 1;
                return <section className={`match-contender seat-${seat}`} key={seat} aria-label={seat === mySeat ? 'Your match profile' : 'Opponent match profile'}>
                    <div className="contender-seat"><span>{seat === 0 ? 'I' : 'II'}</span>{computer ? 'AI' : seat === mySeat ? 'YOU' : 'OPPONENT'}</div>
                    <h2 title={names[seat]}>{names[seat]}</h2>
                    <dl>
                        <div><dt>{online ? 'RATING' : 'AI RATING'}</dt><dd>{(online ? s?.rating : s?.aiRating)?.toLocaleString('en-US') ?? 'N/A'}</dd></div>
                        <div><dt title="All completed AI and online matches">WIN RATE</dt><dd>{matchWinRate(s)}</dd></div>
                        <div><dt>ALL MATCHES</dt><dd>{s?.gamesPlayed?.toLocaleString('en-US') ?? 'N/A'}</dd></div>
                    </dl>
                </section>;
            })}
        </div>
        <div className="minted-coin-stage" aria-label="Coin toss" role="img">
            <div className="coin-ground-shadow" />
            <div className="coin-landing-ring" />
            <div className="minted-coin-flight"><div className="minted-coin" /></div>
        </div>
    </div>;
}
