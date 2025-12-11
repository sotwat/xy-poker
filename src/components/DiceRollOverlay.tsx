import React, { useEffect, useState } from 'react';
import { Dice } from './Dice';
import './DiceRollOverlay.css';
import { playClickSound } from '../utils/sound';
import type { DiceSkin } from '../logic/types';

interface DiceRollOverlayProps {
    targetValues: number[];
    onComplete: () => void;
    selectedSkin: DiceSkin;
}

export const DiceRollOverlay: React.FC<DiceRollOverlayProps> = ({ targetValues, onComplete, selectedSkin }) => {
    const [displayValues, setDisplayValues] = useState<number[]>([1, 1, 1, 1, 1]);
    const [rolling, setRolling] = useState<boolean[]>([true, true, true, true, true]);
    const [stage, setStage] = useState<'ready' | 'rolling' | 'finished'>('ready');

    useEffect(() => {
        console.log('[DiceRollOverlay] Mounted. Target Values:', targetValues);
        // Auto start rolling
        setStage('rolling');
        const intervals: any[] = [];

        // Determine stop times for each dice (staggered)
        const stopDelays = [1500, 1800, 2100, 2400, 2700];

        // Start rolling effect
        displayValues.forEach((_, idx) => {
            const interval = setInterval(() => {
                setDisplayValues(prev => {
                    const next = [...prev];
                    // Random 1-6
                    next[idx] = Math.floor(Math.random() * 6) + 1;
                    return next;
                });
            }, 80);
            intervals.push(interval);

            // Stop each dice
            setTimeout(() => {
                clearInterval(intervals[idx]);
                setDisplayValues(prev => {
                    const next = [...prev];
                    next[idx] = targetValues[idx];
                    return next;
                });
                setRolling(prev => {
                    const next = [...prev];
                    next[idx] = false;
                    return next;
                });

                // Play sound on land?
                playClickSound();
            }, stopDelays[idx]);
        });

        // Cleanup and finish
        const totalDuration = 3500;
        const finishTimer = setTimeout(() => {
            setStage('finished');
            setTimeout(onComplete, 500); // Wait a bit after finish before close
        }, totalDuration);

        return () => {
            intervals.forEach(clearInterval);
            clearTimeout(finishTimer);
        };
    }, []);

    return (
        <div className="dice-roll-overlay">
            <div className="dice-roll-content">
                <h2 className="dice-roll-title">
                    {stage === 'rolling' ? 'Rolling Dice...' : 'Battle Start!'}
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
