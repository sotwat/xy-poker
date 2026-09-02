import React, { useEffect, useRef, useState } from 'react';
import { Dice } from './Dice';
import './DiceRollOverlay.css';
import { playClickSound } from '../utils/sound';
import type { DiceSkin } from '../logic/types';
import { useI18n } from '../i18n';

interface DiceRollOverlayProps {
    targetValues: number[];
    onComplete: () => void;
    selectedSkin: DiceSkin;
}

export const DiceRollOverlay: React.FC<DiceRollOverlayProps> = ({ targetValues, onComplete, selectedSkin }) => {
    const { t } = useI18n();
    const targetsRef = useRef(targetValues.slice(0, 5));
    const onCompleteRef = useRef(onComplete);
    const [reduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const [displayValues, setDisplayValues] = useState<number[]>(() =>
        reduceMotion ? targetValues.slice(0, 5) : [1, 1, 1, 1, 1]
    );
    const [rolling, setRolling] = useState<boolean[]>(() =>
        reduceMotion ? [false, false, false, false, false] : [true, true, true, true, true]
    );
    const [stage, setStage] = useState<'rolling' | 'finished'>(() =>
        reduceMotion ? 'finished' : 'rolling'
    );

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        const intervals: number[] = [];
        const timers: number[] = [];

        if (reduceMotion) {
            timers.push(window.setTimeout(() => onCompleteRef.current(), 500));
            return () => timers.forEach(window.clearTimeout);
        }

        const stopDelays = [700, 860, 1020, 1180, 1340];

        targetsRef.current.forEach((target, idx) => {
            const interval = window.setInterval(() => {
                setDisplayValues(prev => {
                    const next = [...prev];
                    next[idx] = Math.floor(Math.random() * 6) + 1;
                    return next;
                });
            }, 90);
            intervals.push(interval);

            timers.push(window.setTimeout(() => {
                window.clearInterval(interval);
                setDisplayValues(prev => {
                    const next = [...prev];
                    next[idx] = target;
                    return next;
                });
                setRolling(prev => {
                    const next = [...prev];
                    next[idx] = false;
                    return next;
                });
                playClickSound();
            }, stopDelays[idx]));
        });

        timers.push(window.setTimeout(() => {
            setStage('finished');
            timers.push(window.setTimeout(() => onCompleteRef.current(), 450));
        }, 1550));

        return () => {
            intervals.forEach(window.clearInterval);
            timers.forEach(window.clearTimeout);
        };
    }, [reduceMotion]);

    return (
        <div className="dice-roll-overlay">
            <div className="dice-roll-content">
                <h2 className="dice-roll-title">
                    {stage === 'rolling' ? t('dice.rolling') : t('dice.ready')}
                </h2>
                <div className="dice-container-large">
                    {displayValues.map((val, idx) => (
                        <div key={idx} className={`rolling-dice ${rolling[idx] ? 'shaking' : 'landed'}`}>
                            <Dice value={val} size="large" skin={selectedSkin} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
