import React, { useEffect, useState } from 'react';
import type { DiceSkin } from '../logic/types';
import { AVAILABLE_DICE_SKINS, AVAILABLE_CARD_SKINS, AVAILABLE_BOARD_SKINS } from '../logic/types';
import { Dice } from './Dice';
import { playGachaSoundSequence } from '../utils/sound';
import './GachaReveal.css';

interface GachaRevealProps {
    unlockedItem: {
        type: 'dice' | 'card' | 'board';
        id: string;
    };
    onClose: () => void;
}

export const GachaReveal: React.FC<GachaRevealProps> = ({ unlockedItem, onClose }) => {
    const [stage, setStage] = useState<'summon' | 'charging' | 'explosion' | 'reveal'>('summon');

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

    // Helper to get display details
    const getItemDetails = () => {
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

    const { name, color, component } = getItemDetails();

    return (
        <div className={`gacha-overlay stage-${stage}`} onClick={stage === 'reveal' ? onClose : undefined}>
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
                <div className="reveal-container">
                    <div className="god-rays"></div>
                    <h2 className="gacha-title">UNLOCKED!</h2>
                    <div className="item-showcase" style={{ '--item-color': color } as React.CSSProperties}>
                        {component}
                    </div>
                    <div className="item-name">{name}</div>
                    <p className="tap-to-close">Tap to Claim</p>
                </div>
            )}
        </div>
    );
};
