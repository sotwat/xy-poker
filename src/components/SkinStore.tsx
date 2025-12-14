import React, { useState, useEffect } from 'react';
import {
    AVAILABLE_DICE_SKINS, AVAILABLE_CARD_SKINS, AVAILABLE_BOARD_SKINS,
    type DiceSkin, type CardSkin, type BoardSkin
} from '../logic/types';
import { Dice } from './Dice';
import { playClickSound } from '../utils/sound';
import './SkinStore.css';

import { supabase } from '../supabase';

interface SkinStoreProps {
    isOpen: boolean;
    onClose: () => void;
    userId?: string; // Added userId

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

const GACHA_COST_SINGLE = 100;
const GACHA_COST_MULTI = 1000;
const AD_REWARD_COINS = 100;

export const SkinStore: React.FC<SkinStoreProps> = ({
    isOpen, onClose, userId,
    unlockedSkins, selectedSkin, onUnlock, onSelect,
    unlockedCardSkins, selectedCardSkin, onUnlockCard, onSelectCard,
    unlockedBoardSkins, selectedBoardSkin, onUnlockBoard, onSelectBoard
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('dice');
    const [userCoins, setUserCoins] = useState<number>(0);
    // const [loadingCoins, setLoadingCoins] = useState(false);

    // Gacha State
    const [gachaResults, setGachaResults] = useState<UnlockableItem[]>([]);
    const [showGachaReveal, setShowGachaReveal] = useState(false);
    const [isWatchingAd, setIsWatchingAd] = useState(false);

    // Fetch coins on open
    useEffect(() => {
        if (isOpen && userId) {
            fetchCoins();
        }
    }, [isOpen, userId]);

    const fetchCoins = async () => {
        // setLoadingCoins(true);
        const { data } = await supabase
            .from('players')
            .select('coins')
            .eq('id', userId)
            // We need to resolve internal ID or query by user_id if that's what we have. 
            // App passes user_id as 'userId' prop usually? No, let's allow it to fetch by user_id effectively.
            .single();

        if (data) setUserCoins(data.coins || 0);
        // setLoadingCoins(false);
    };

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

    const handleGacha = async (count: 1 | 10) => {
        if (!userId) {
            alert("Please sign in to use Gacha!");
            return;
        }
        const cost = count === 1 ? GACHA_COST_SINGLE : GACHA_COST_MULTI;

        if (userCoins < cost) {
            alert(`Not enough coins! Need ${cost} coins.`);
            return;
        }

        const locked = getLockedItems();
        if (locked.length === 0) {
            alert("All skins collected! You are amazing!");
            return;
        }

        playClickSound();

        // Deduct Coins
        const newBalance = userCoins - cost;
        setUserCoins(newBalance);

        // Optimistic update, but really should be transactional in DB
        // For prototype, we update client side then DB
        // Fetch internal ID first? Or just update by user_id
        await supabase.from('players').update({ coins: newBalance }).eq('user_id', userId);

        const results: UnlockableItem[] = [];
        for (let i = 0; i < count; i++) {
            // If we run out of locked items, we just give duplicates (which do nothing currently, or give coins back?)
            // User logic: "Gacha is ... random". 
            // Simplification: We pick from ALL items (unlocked or not). If unlocked, it's a dupe (maybe 50 coins refund?).
            // User Instruction: "Gacha...". Usually implies randomness.

            // Let's pool ALL avail items
            const allItems: UnlockableItem[] = [
                ...AVAILABLE_DICE_SKINS.map(s => ({ type: 'dice' as const, id: s.id })),
                ...AVAILABLE_CARD_SKINS.map(s => ({ type: 'card' as const, id: s.id })),
                ...AVAILABLE_BOARD_SKINS.map(s => ({ type: 'board' as const, id: s.id }))
            ];

            const won = allItems[Math.floor(Math.random() * allItems.length)];
            results.push(won);

            // Unlock logic
            if (won.type === 'dice' && !unlockedSkins.includes(won.id as DiceSkin)) onUnlock(won.id as DiceSkin);
            if (won.type === 'card' && !unlockedCardSkins.includes(won.id as CardSkin)) onUnlockCard(won.id as CardSkin);
            if (won.type === 'board' && !unlockedBoardSkins.includes(won.id as BoardSkin)) onUnlockBoard(won.id as BoardSkin);
        }

        setGachaResults(results);
        setShowGachaReveal(true);
    };

    const handleWatchAd = () => {
        if (!userId) return;
        setIsWatchingAd(true);
        playClickSound();
        window.open('https://otieu.com/4/10307496', '_blank'); // Ad Link

        setTimeout(async () => {
            setIsWatchingAd(false);
            const newBalance = userCoins + AD_REWARD_COINS;
            setUserCoins(newBalance);
            await supabase.from('players').update({ coins: newBalance }).eq('user_id', userId);
            alert(`Thanks for watching! +${AD_REWARD_COINS} Coins!`);
        }, 5000); // 5 sec simulated ad
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

    if (showGachaReveal) {
        return (
            <GachaReveal
                results={gachaResults}
                onClose={() => setShowGachaReveal(false)}
            />
        );
    }

    return (
        <div className="skin-store-overlay">
            <div className="skin-store-modal">
                <button className="btn-close-x" onClick={() => { playClickSound(); onClose(); }}>×</button>
                <div className="store-header">
                    <h2>Skin Shop</h2>
                    {userId && (
                        <div className="coin-balance">
                            <span className="coin-icon">🪙</span>
                            <span className="coin-amount">{userCoins}</span>
                            <button className="btn-add-coins" onClick={handleWatchAd} disabled={isWatchingAd}>
                                {isWatchingAd ? '...' : '+'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Gacha Actions */}
                <div className="gacha-actions">
                    <div className="gacha-option" onClick={() => handleGacha(1)}>
                        <div className="gacha-label">Single Pull</div>
                        <div className="gacha-cost">🪙 {GACHA_COST_SINGLE}</div>
                    </div>
                    <div className="gacha-option special" onClick={() => handleGacha(10)}>
                        <div className="gacha-label">10x Pull</div>
                        <div className="gacha-cost">🪙 {GACHA_COST_MULTI}</div>
                    </div>
                </div>

                <div className="store-tabs">
                    <button className={`tab-btn ${activeTab === 'dice' ? 'active' : ''}`} onClick={() => setActiveTab('dice')}>Dice</button>
                    <button className={`tab-btn ${activeTab === 'card' ? 'active' : ''}`} onClick={() => setActiveTab('card')}>Cards</button>
                    <button className={`tab-btn ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>Boards</button>
                </div>

                {renderContent()}

                <button className="btn-close" onClick={() => { playClickSound(); onClose(); }}>Close</button>
            </div>
        </div>
    );
};
