import React from 'react';
import { AVAILABLE_DICE_SKINS, type DiceSkin } from '../logic/types';
import { Dice } from './Dice';
import { playClickSound, playSuccessSound } from '../utils/sound';
import './DiceSkinStore.css';

interface DiceSkinStoreProps {
    isOpen: boolean;
    onClose: () => void;
    unlockedSkins: DiceSkin[];
    selectedSkin: DiceSkin;
    onUnlock: (skinId: DiceSkin) => void;
    onSelect: (skinId: DiceSkin) => void;
}

export const DiceSkinStore: React.FC<DiceSkinStoreProps> = ({
    isOpen,
    onClose,
    unlockedSkins,
    selectedSkin,
    onUnlock,
    onSelect
}) => {
    if (!isOpen) return null;

    const handleSkinClick = (skinId: DiceSkin) => {
        playClickSound();
        if (unlockedSkins.includes(skinId)) {
            // Already unlocked -> Select
            onSelect(skinId);
        } else {
            // Locked -> Offer Unlock (Ad)
            if (window.confirm(`Watch an ad to unlock the ${skinId.toUpperCase()} dice skin?`)) {
                // Open Direct Link
                window.open('https://otieu.com/4/10307496', '_blank');

                // Simulate "reward granted" on return (or after delay)
                // In real app, we might need a better callback or verification
                setTimeout(() => {
                    if (window.confirm("Did you finish watching the ad? Click OK to unlock.")) {
                        playSuccessSound();
                        onUnlock(skinId);
                    }
                }, 2000);
            }
        }
    };

    return (
        <div className="skin-store-overlay">
            <div className="skin-store-modal">
                <h2>Dice Skin Shop</h2>
                <div className="skins-grid">
                    {AVAILABLE_DICE_SKINS.map((skin) => {
                        const isUnlocked = unlockedSkins.includes(skin.id);
                        const isSelected = selectedSkin === skin.id;

                        return (
                            <div
                                key={skin.id}
                                className={`skin-item ${isUnlocked ? 'unlocked' : 'locked'} ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleSkinClick(skin.id)}
                            >
                                <div className="skin-preview">
                                    <Dice value={6} size="medium" skin={skin.id} />
                                </div>
                                <div className="skin-name">{skin.name}</div>
                                {!isUnlocked && <div className="lock-icon">🔒</div>}
                                {isSelected && <div className="check-icon">✓</div>}
                            </div>
                        );
                    })}
                </div>
                <button className="btn-close" onClick={() => { playClickSound(); onClose(); }}>Close</button>
            </div>
        </div>
    );
};
