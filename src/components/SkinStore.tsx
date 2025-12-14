import React, { useState, useEffect } from 'react';
import {
    AVAILABLE_DICE_SKINS, AVAILABLE_CARD_SKINS, AVAILABLE_BOARD_SKINS,
    type DiceSkin, type CardSkin, type BoardSkin
} from '../logic/types';
import { Dice } from './Dice';
import { playClickSound } from '../utils/sound';
import './SkinStore.css';

interface SkinStoreProps {
    isOpen: boolean;
    onClose: () => void;

    // Dice
    unlockedSkins: DiceSkin[];
    selectedSkin: DiceSkin;
    onUnlock: (skinId: DiceSkin) => void;
    onSelect: (skinId: DiceSkin) => void;

    // Cards
    unlockedCardSkins: CardSkin[];
    selectedCardSkin: CardSkin;
    onUnlockCard: (skinId: CardSkin) => void;
    onSelectCard: (skinId: CardSkin) => void;

    // Boards
    unlockedBoardSkins: BoardSkin[];
    selectedBoardSkin: BoardSkin;
    onUnlockBoard: (skinId: BoardSkin) => void;
    onSelectBoard: (skinId: BoardSkin) => void;
}

import { GachaReveal } from './GachaReveal';

type Tab = 'dice' | 'card' | 'board';
type UnlockableItem = { type: 'dice' | 'card' | 'board', id: string };

export const SkinStore: React.FC<SkinStoreProps> = ({
    isOpen, onClose,
    unlockedSkins, selectedSkin, onUnlock, onSelect,
    unlockedCardSkins, selectedCardSkin, onUnlockCard, onSelectCard,
    unlockedBoardSkins, selectedBoardSkin, onUnlockBoard, onSelectBoard
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('dice');
    const [canClaim, setCanClaim] = useState(false);
    const [gachaBannerShake, setGachaBannerShake] = useState(false);

    // Gacha State
    const [pendingGacha, setPendingGacha] = useState(false);
    const [gachaResult, setGachaResult] = useState<UnlockableItem | null>(null);
    const [showGachaReveal, setShowGachaReveal] = useState(false);

    // Reset state when closing store
    useEffect(() => {
        if (!isOpen) {
            setCanClaim(false);
            setPendingGacha(false);
            setShowGachaReveal(false);
            setGachaResult(null);
            setActiveTab('dice');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // --- Gacha Logic ---
    const getLockedItems = (): UnlockableItem[] => {
        const locked: UnlockableItem[] = [];
        AVAILABLE_DICE_SKINS.forEach(s => {
            if (!unlockedSkins.includes(s.id as DiceSkin)) locked.push({ type: 'dice', id: s.id });
        });
        AVAILABLE_CARD_SKINS.forEach(s => {
            if (!unlockedCardSkins.includes(s.id as CardSkin)) locked.push({ type: 'card', id: s.id });
        });
        AVAILABLE_BOARD_SKINS.forEach(s => {
            if (!unlockedBoardSkins.includes(s.id as BoardSkin)) locked.push({ type: 'board', id: s.id });
        });
        return locked;
    };

    const handleGachaAttempt = () => {
        const locked = getLockedItems();
        if (locked.length === 0) {
            alert("All skins collected! You are amazing!");
            return;
        }

        playClickSound();
        window.open('https://otieu.com/4/10307496', '_blank');
        setPendingGacha(true);
        setCanClaim(false);

        // Simulate Ad Watch
        setTimeout(() => {
            setCanClaim(true);
        }, 3000);
    };

    const finalizeGacha = () => {
        if (!canClaim || !pendingGacha) return;

        const locked = getLockedItems(); // Re-check
        if (locked.length === 0) return;

        const randomIndex = Math.floor(Math.random() * locked.length);
        const wonItem = locked[randomIndex];

        // Unlock it
        if (wonItem.type === 'dice') onUnlock(wonItem.id as DiceSkin);
        if (wonItem.type === 'card') onUnlockCard(wonItem.id as CardSkin);
        if (wonItem.type === 'board') onUnlockBoard(wonItem.id as BoardSkin);

        setGachaResult(wonItem);
        setPendingGacha(false);
        setCanClaim(false);
        setShowGachaReveal(true);
    };

    // Generic Handlers
    const handleSkinClick = (
        id: string,
        isUnlocked: boolean,
        selectFn: (id: string) => void
    ) => {
        playClickSound();
        if (isUnlocked) {
            selectFn(id);
        } else {
            // Locked -> Redirect to Gacha
            // Shake the banner to indicate "Use Gacha!"
            setGachaBannerShake(true);
            setTimeout(() => setGachaBannerShake(false), 500);
        }
    };

    // Render Tab Content
    const renderContent = () => {
        let items: { id: string, name: string, color: string }[] = [];
        let unlocked: string[] = [];
        let selected: string = '';
        let selectFn: (id: string) => void = () => { };
        let PreviewComponent: any = null;

        if (activeTab === 'dice') {
            items = AVAILABLE_DICE_SKINS;
            unlocked = unlockedSkins;
            selected = selectedSkin;
            selectFn = onSelect as (id: string) => void;
            PreviewComponent = ({ id }: { id: string }) => (
                <Dice value={6} size="medium" skin={id as DiceSkin} />
            );
        } else if (activeTab === 'card') {
            items = AVAILABLE_CARD_SKINS;
            unlocked = unlockedCardSkins;
            selected = selectedCardSkin;
            selectFn = onSelectCard as (id: string) => void;
            PreviewComponent = ({ id }: { id: string }) => (
                <div className={`preview-card card-back-${id}`}>
                    <div className="card-inner"></div>
                </div>
            );
        } else {
            items = AVAILABLE_BOARD_SKINS;
            unlocked = unlockedBoardSkins;
            selected = selectedBoardSkin;
            selectFn = onSelectBoard as (id: string) => void;
            PreviewComponent = ({ id, color }: { id: string, color: string }) => (
                <div className={`preview-board board-theme-${id}`} style={{ background: id === 'classic-green' ? undefined : color }}>
                    <div className="board-line"></div>
                </div>
            );
        }

        return (
            <div className="skins-grid">
                {items.map((item) => {
                    const isUnlocked = unlocked.includes(item.id);
                    const isSelected = selected === item.id;

                    return (
                        <div
                            key={item.id}
                            className={`skin-item ${isUnlocked ? 'unlocked' : 'locked'} ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSkinClick(item.id, isUnlocked, selectFn)}
                        >
                            <div className="skin-preview">
                                <PreviewComponent id={item.id} color={item.color} />
                            </div>
                            <div className="skin-name">{item.name}</div>
                            {!isUnlocked && <div className="lock-icon">🔒</div>}
                            {isSelected && <div className="check-icon">✓</div>}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="skin-store-overlay">
            {showGachaReveal && gachaResult && (
                <GachaReveal unlockedItem={gachaResult} onClose={() => setShowGachaReveal(false)} />
            )}

            <div className="skin-store-modal">
                <button className="btn-close-x" onClick={() => { playClickSound(); onClose(); }}>×</button>
                <h2>Skin Shop</h2>

                {/* Gacha Banner */}
                {!pendingGacha ? (
                    <div className={`gacha-banner ${gachaBannerShake ? 'shake-hint' : ''}`} onClick={handleGachaAttempt}>
                        <div className="gacha-icon">🎁</div>
                        <div className="gacha-text">
                            <h3>Mystery Gacha</h3>
                            <p>Unlock Random Skin (3h)</p>
                        </div>
                        <div className="gacha-btn">WATCH AD</div>
                    </div>
                ) : (
                    <div className="gacha-pending">
                        <div className="watching-text">{canClaim ? 'Ready!' : 'Watching Ad...'}</div>
                        {canClaim && (
                            <button className="btn-claim-gacha pulse-animation" onClick={finalizeGacha}>
                                OPEN GACHA!
                            </button>
                        )}
                    </div>
                )}

                <div className="store-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'dice' ? 'active' : ''}`}
                        onClick={() => { playClickSound(); setActiveTab('dice'); }}
                    >
                        Dice
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'card' ? 'active' : ''}`}
                        onClick={() => { playClickSound(); setActiveTab('card'); }}
                    >
                        Cards
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'board' ? 'active' : ''}`}
                        onClick={() => { playClickSound(); setActiveTab('board'); }}
                    >
                        Boards
                    </button>
                </div>

                {renderContent()}

                <button className="btn-close" onClick={() => { playClickSound(); onClose(); }}>Close</button>
            </div>
        </div>
    );
};
