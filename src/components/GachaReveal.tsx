import React, { useEffect, useState } from 'react';
import { playGachaSoundSequence, playClickSound } from '../utils/sound';
import { Dice } from './Dice';
import { AVAILABLE_DICE_SKINS, AVAILABLE_CARD_SKINS, AVAILABLE_BOARD_SKINS, type DiceSkin } from '../logic/types';
import './GachaReveal.css';

interface GachaRevealProps {
    results: { type: string, id: string }[];
    onClose: () => void;
}

export const GachaReveal: React.FC<GachaRevealProps> = ({ results, onClose }) => {



    const [stage, setStage] = useState<'summon' | 'charging' | 'explosion' | 'reveal'>('summon');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showSummary, setShowSummary] = useState(false);

    useEffect(() => {
        // Start the cinematic sound sequence
        playGachaSoundSequence();

        // Sequence
        // 0s: Summon (Drone)
        // 2s: Charging (Riser)
        const chargeTimer = setTimeout(() => setStage('charging'), 2000);
        // 3.5s: Explosion (Impact)
        const explodeTimer = setTimeout(() => setStage('explosion'), 3500);
        // 3.8s: Reveal (Chord)
        const revealTimer = setTimeout(() => {
            setStage('reveal');
        }, 3800);

        return () => {
            clearTimeout(chargeTimer);
            clearTimeout(explodeTimer);
            clearTimeout(revealTimer);
        };
    }, []);

    const isMulti = results.length > 1;

    // Rapid Reveal Sequence for Multi
    useEffect(() => {
        if (stage === 'reveal' && isMulti && !showSummary) {
            if (currentIndex < results.length) {
                const timer = setTimeout(() => {
                    playClickSound(); // Sound for each reveal
                    if (currentIndex === results.length - 1) {
                        // End of sequence, wait a bit longer then show summary
                        setTimeout(() => setShowSummary(true), 800);
                    } else {
                        setCurrentIndex(prev => prev + 1);
                    }
                }, 200); // 0.2s interval
                return () => clearTimeout(timer);
            }
        }
    }, [stage, isMulti, currentIndex, results.length, showSummary]);


    // Helper for Single Item Display (Current Index)
    const getSingleItemDetails = (index: number) => {
        if (results.length === 0) return null;
        const unlockedItem = results[index];

        if (unlockedItem.type === 'dice') {
            const item = AVAILABLE_DICE_SKINS.find(s => s.id === unlockedItem.id);
            return { name: item?.name, color: item?.color, component: <Dice value={6} size="large" skin={unlockedItem.id as DiceSkin} /> };
        }
        if (unlockedItem.type === 'card') {
            const item = AVAILABLE_CARD_SKINS.find(s => s.id === unlockedItem.id);
            return {
                name: item?.name, color: item?.color, component: (
                    <div className={`preview-card-large card-back-${unlockedItem.id}`}>
                        <div className="card-inner"></div>
                    </div>
                )
            };
        }
        if (unlockedItem.type === 'board') {
            const item = AVAILABLE_BOARD_SKINS.find(s => s.id === unlockedItem.id);
            return {
                name: item?.name, color: item?.color, component: (
                    <div className={`preview-board-large board-theme-${unlockedItem.id}`} style={{ background: unlockedItem.id === 'classic-green' ? undefined : item?.color }}>
                        <div className="board-line"></div>
                    </div>
                )
            };
        }
        return { name: 'Unknown', color: '#fff', component: null };
    };

    const currentItemDetails = getSingleItemDetails(currentIndex);

    return (
        <div className={`gacha-reveal-overlay stage-${stage}`} onClick={stage === 'reveal' && (!isMulti || showSummary) ? onClose : undefined}>
            {stage !== 'reveal' && (
                <div className="trigger-container">
                    <div className="summon-circle"></div>
                    <div className="energy-orb"></div>
                    {stage === 'charging' && (
                        <>
                            <div className="charge-particles"></div>
                            <div className="warp-lines"></div>
                        </>
                    )}
                </div>
            )}

            {stage === 'explosion' && <div className="white-flash"></div>}

            {stage === 'reveal' && (
                <div className="gacha-reveal-content full-screen-reveal" onClick={(e) => e.stopPropagation()}>

                    {/* ITEM REVEAL SEQUENCE (Single or Rapid Multi) */}
                    {(!showSummary) && currentItemDetails && (
                        <div key={currentIndex} className="reveal-container animate-pop">
                            {/* Key added to force re-render/animation for each item */}
                            <div className="god-rays"></div>
                            <h2 className="gacha-title">UNLOCKED!</h2>
                            <div className="item-showcase" style={{ '--item-color': currentItemDetails.color } as React.CSSProperties}>
                                {currentItemDetails.component}
                            </div>
                            <div className="item-name">{currentItemDetails.name}</div>
                            {!isMulti && <button className="btn-collect" onClick={onClose}>Collect</button>}
                            {isMulti && <div className="multi-counter">{currentIndex + 1} / {results.length}</div>}
                        </div>
                    )}

                    {/* MULTI ITEM SUMMARY */}
                    {isMulti && showSummary && (
                        <>
                            <h2>Gacha Results!</h2>
                            <div className="results-grid">
                                {results.map((item, idx) => (
                                    <div key={idx} className="reveal-item">
                                        <div className={`reveal-preview type-${item.type}`}>
                                            {item.type === 'dice' && '🎲'}
                                            {item.type === 'card' && '🃏'}
                                            {item.type === 'board' && '🏁'}
                                        </div>
                                        <div className="reveal-name">{item.id}</div>
                                    </div>
                                ))}
                            </div>
                            <button className="btn-collect" onClick={onClose}>Collect All</button>
                        </>
                    )}

                </div>
            )}
        </div>
    );
};
