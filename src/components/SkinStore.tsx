import { Modal } from './Modal';
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, Coins, LockKeyhole } from 'lucide-react';
import {
    AVAILABLE_DICE_SKINS, AVAILABLE_CARD_SKINS, AVAILABLE_BOARD_SKINS,
    type DiceSkin, type CardSkin, type BoardSkin
} from '../logic/types';
import { Dice } from './Dice';
import { playClickSound } from '../utils/sound';
import './SkinStore.css';

import { supabase } from '../supabase';
import { PremiumBadge } from './PremiumBadge';
import { socket } from '../logic/online';
import { getBrowserId } from '../utils/identity';
import { useI18n } from '../i18n';

interface SkinStoreProps {
    isOpen: boolean;
    onClose: () => void;
    userId?: string; // Added userId
    isPremium?: boolean; // [NEW]

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
type PreviewProps = { id: string; color: string };
type CoinDeductionResponse = { success: boolean; newBalance?: number; error?: string };

const GACHA_COST_SINGLE = 100;
const GACHA_COST_MULTI = 1000;

export const SkinStore: React.FC<SkinStoreProps> = ({
    isOpen, onClose, userId, isPremium = false,
    unlockedSkins, selectedSkin, onUnlock, onSelect,
    unlockedCardSkins, selectedCardSkin, onUnlockCard, onSelectCard,
    unlockedBoardSkins, selectedBoardSkin, onUnlockBoard, onSelectBoard
}) => {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<Tab>('dice');
    const [userCoins, setUserCoins] = useState<number>(0);
    // const [loadingCoins, setLoadingCoins] = useState(false);

    // Gacha State
    const [gachaResults, setGachaResults] = useState<UnlockableItem[]>([]);
    const [showGachaReveal, setShowGachaReveal] = useState(false);
    const [isWatchingAd, setIsWatchingAd] = useState(false);

    const fetchCoins = useCallback(async () => {
        if (!userId) return;
        const { data } = await supabase
            .from('players')
            .select('coins')
            .eq('id', userId)
            .single();

        if (data) setUserCoins(data.coins || 0);
    }, [userId]);

    useEffect(() => {
        if (!isOpen) return;

        if (userId) {
            const timer = window.setTimeout(() => void fetchCoins(), 0);
            return () => window.clearTimeout(timer);
        }

        const saved = localStorage.getItem('xypoker_guest_coins');
        const timer = window.setTimeout(() => {
            setUserCoins(saved ? Number.parseInt(saved, 10) || 0 : 0);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchCoins, isOpen, userId]);

    if (!isOpen) return null;

    // --- Gacha Logic ---
    const getLockedItems = (): UnlockableItem[] => {
        const locked: UnlockableItem[] = [];
        const defaults = ['white', 'classic', 'classic-green'];

        AVAILABLE_DICE_SKINS.forEach(s => {
            if (!defaults.includes(s.id) && !unlockedSkins.includes(s.id as DiceSkin)) {
                locked.push({ type: 'dice', id: s.id });
            }
        });
        AVAILABLE_CARD_SKINS.forEach(s => {
            if (!defaults.includes(s.id) && !unlockedCardSkins.includes(s.id as CardSkin)) {
                locked.push({ type: 'card', id: s.id });
            }
        });
        AVAILABLE_BOARD_SKINS.forEach(s => {
            if (!defaults.includes(s.id) && !unlockedBoardSkins.includes(s.id as BoardSkin)) {
                locked.push({ type: 'board', id: s.id });
            }
        });
        return locked;
    };

    const handleGacha = async (count: 1 | 10, isFree: boolean = false) => {
        // if (!userId) { ... }  <-- Removed check to allow guests

        const locked = getLockedItems();
        const pullCount = Math.min(count, locked.length);
        const cost = pullCount === 1 ? GACHA_COST_SINGLE : GACHA_COST_SINGLE * pullCount;

        if (!isFree && userCoins < cost) {
            alert(t('store.notEnough', { cost }));
            return;
        }

        if (locked.length === 0) {
            alert(t('store.complete'));
            return;
        }

        playClickSound();

        // Deduct Coins only if not free
        if (!isFree) {
            if (userId) {
                const success = await new Promise<boolean>((resolve) => {
                    const timeout = window.setTimeout(() => resolve(false), 5000);
                    socket.emit('deduct_coins', { amount: cost, browserId: getBrowserId(), userId }, (res: CoinDeductionResponse) => {
                        window.clearTimeout(timeout);
                        resolve(res.success);
                    });
                });
                if (!success) {
                    alert(t('store.deductFailed'));
                    return; // Abort
                }
            }
            
            const newBalance = userCoins - cost;
            setUserCoins(newBalance);

            if (!userId) {
                localStorage.setItem('xypoker_guest_coins', newBalance.toString());
            }
        }

        const allItems = [...locked];

        // Shuffle (Fisher-Yates) to ensure random unique selection
        for (let i = allItems.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
        }

        // Take unique items
        // If we want allow duplicates across user inventory but NOT in the single pull, 
        // we just take the first N from the shuffled list.
        // (Assuming pool size > 10, which it is: 12+12+12 = 36 - 3 = 33 items)
        const results = allItems.slice(0, pullCount);

        // Process Unlocks
        results.forEach(won => {
            if (won.type === 'dice' && !unlockedSkins.includes(won.id as DiceSkin)) onUnlock(won.id as DiceSkin);
            if (won.type === 'card' && !unlockedCardSkins.includes(won.id as CardSkin)) onUnlockCard(won.id as CardSkin);
            if (won.type === 'board' && !unlockedBoardSkins.includes(won.id as BoardSkin)) onUnlockBoard(won.id as BoardSkin);
        });

        setGachaResults(results);
        setShowGachaReveal(true);
    };

    const handleWatchAd = () => {
        // if (!userId) return; <-- Allow guests
        playClickSound();

        // If Premium, skip ad and give reward instantly
        if (isPremium) {
            handleGacha(1, true);
            return;
        }

        setIsWatchingAd(true);
        const adWindow = window.open('https://otieu.com/4/10307496', '_blank', 'noopener,noreferrer');
        if (adWindow) adWindow.opener = null;

        setTimeout(async () => {
            setIsWatchingAd(false);
            // Reward: Free Single Gacha
            handleGacha(1, true);
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
        let PreviewComponent: React.ComponentType<PreviewProps>;

        if (activeTab === 'dice') {
            items = AVAILABLE_DICE_SKINS;
            unlocked = unlockedSkins;
            selected = selectedSkin;
            selectFn = onSelect as (id: string) => void;
            PreviewComponent = ({ id }: PreviewProps) => (
                <Dice value={6} size="small" skin={id as DiceSkin} />
            );
        } else if (activeTab === 'card') {
            items = AVAILABLE_CARD_SKINS;
            unlocked = unlockedCardSkins;
            selected = selectedCardSkin;
            selectFn = onSelectCard as (id: string) => void;
            PreviewComponent = ({ id }: PreviewProps) => (
                <div className={`preview-card card-back-${id}`}>
                    <div className="card-back"></div>
                </div>
            );
        } else {
            items = AVAILABLE_BOARD_SKINS;
            unlocked = unlockedBoardSkins;
            selected = selectedBoardSkin;
            selectFn = onSelectBoard as (id: string) => void;
            PreviewComponent = ({ id, color }: PreviewProps) => (
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
                        <button
                            type="button"
                            key={item.id}
                            className={`skin-item ${isUnlocked ? 'unlocked' : 'locked'} ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSkinClick(item.id, isUnlocked, selectFn)}
                            disabled={!isUnlocked}
                            aria-pressed={isSelected}
                        >
                            <div className="skin-preview">
                                <PreviewComponent id={item.id} color={item.color} />
                            </div>
                            <div className="skin-name">{item.name}</div>
                            {!isUnlocked && <LockKeyhole className="lock-icon" aria-hidden="true" />}
                            {isSelected && <span className="check-icon"><Check aria-hidden="true" /></span>}
                        </button>
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
        <Modal className="skin-store-overlay" label={t('store.title')} onClose={onClose}>
            <div className="skin-store-modal">
                <button type="button" className="btn-close-x" onClick={() => { playClickSound(); onClose(); }} aria-label={t('common.close')}>×</button>
                <div className="store-header">
                    <h2>{t('store.title')}</h2>
                    <div className="coin-balance">
                        <Coins className="coin-icon" aria-hidden="true" /> {userCoins}
                        <div className="ad-box">
                            <button type="button" className="btn-ad" onClick={handleWatchAd} disabled={isWatchingAd}>
                                {isWatchingAd ? t('store.watching') : (isPremium ? <span><PremiumBadge /> {t('store.freePremium')}</span> : t('store.watchFree'))}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="expiry-notice">
                    <Clock3 aria-hidden="true" /> {t('store.expiry')}
                </div>

                {/* Gacha Actions */}
                <div className="gacha-actions">
                    <button type="button" className="gacha-option" onClick={() => handleGacha(1)}>
                        <div className="gacha-label">{t('store.single')}</div>
                        <div className="gacha-cost"><Coins aria-hidden="true" /> {GACHA_COST_SINGLE}</div>
                    </button>
                    <button type="button" className="gacha-option special" onClick={() => handleGacha(10)}>
                        <div className="gacha-label">{t('store.multi')}</div>
                        <div className="gacha-cost"><Coins aria-hidden="true" /> {GACHA_COST_MULTI}</div>
                    </button>
                </div>

                <div className="store-tabs">
                    <button type="button" className={`tab-btn ${activeTab === 'dice' ? 'active' : ''}`} onClick={() => setActiveTab('dice')}>{t('store.dice')}</button>
                    <button type="button" className={`tab-btn ${activeTab === 'card' ? 'active' : ''}`} onClick={() => setActiveTab('card')}>{t('store.cards')}</button>
                    <button type="button" className={`tab-btn ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>{t('store.boards')}</button>
                </div>

                {renderContent()}

                <button type="button" className="btn-close" onClick={() => { playClickSound(); onClose(); }}>{t('common.close')}</button>
            </div>
        </Modal>
    );
};
