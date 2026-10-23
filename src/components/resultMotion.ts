import { createContext, useContext } from 'react';
import type { createResultAudio } from '../utils/resultAudio';

export function setResultNumber(element: HTMLElement, value: number) {
    const strips = element.querySelectorAll<HTMLElement>('.result-digit-strip');
    const digits = String(Math.round(Math.abs(value))).padStart(strips.length, '0');
    strips.forEach((strip, index) => {
        strip.style.transform = `translateY(-${Number(digits[index]) * 10}%)`;
        strip.parentElement!.style.opacity = index < digits.length - 1 && Number(digits.slice(0, index + 1)) === 0 ? '0' : '1';
    });
}

type ResultAudio = ReturnType<typeof createResultAudio>;
export const ResultContext = createContext<{ skipped: boolean; play: ResultAudio['play']; finish: () => void }>({ skipped: false, play: () => {}, finish: () => {} });
export const useResultScene = () => useContext(ResultContext);


export function countResultNumber(timeline: gsap.core.Timeline, element: HTMLElement, at: number, duration: number, onTick?: () => void) {
    const from = Number(element.dataset.numberFrom ?? 0);
    const to = Number(element.dataset.numberTo ?? 0);
    const counter = { value: from };
    let lastTick = -1;
    setResultNumber(element, from);
    timeline.to(counter, { value: to, duration, ease: 'power2.out', onUpdate: () => {
        setResultNumber(element, counter.value);
        const tick = Math.floor(timeline.time() * 12);
        if (tick !== lastTick && from !== to) { lastTick = tick; onTick?.(); }
    } }, at);
}

