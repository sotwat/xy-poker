import React, { useState, useEffect } from 'react';
import {
    AVAILABLE_DICE_SKINS, AVAILABLE_CARD_SKINS, AVAILABLE_BOARD_SKINS,
    type DiceSkin, type CardSkin, type BoardSkin
} from '../logic/types';
import { Dice } from './Dice';
import { playClickSound, playSuccessSound } from '../utils/sound';
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

type Tab = 'dice' | 'card' | 'board';

export const SkinStore: React.FC<SkinStoreProps> = ({
    isOpen, onClose,
    unlockedSkins, selectedSkin, onUnlock, onSelect,
    unlockedCardSkins, selectedCardSkin, onUnlockCard, onSelectCard,
    unlockedBoardSkins, selectedBoardSkin, onUnlockBoard, onSelectBoard
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('dice');
    const [pendingUnlock, setPendingUnlock] = useState<string | null>(null);
    const [canClaim, setCanClaim] = useState(false);

    // Reset state when closing store
    useEffect(() => {
        if (!isOpen) {
            setPendingUnlock(null);
            setCanClaim(false);
            setActiveTab('dice');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Generic Handlers
    const handleSkinClick = (
        id: string,
        isUnlocked: boolean,
        selectFn: (id: any) => void
    ) => {
        playClickSound();
        if (isUnlocked) {
            selectFn(id);
        } else {
            // Locked -> Start Ad Flow
            if (pendingUnlock === id) return;

            window.open('https://otieu.com/4/10307496', '_blank');
            setPendingUnlock(id);
            setCanClaim(false);

            setTimeout(() => {
                setCanClaim(true);
            }, 3000);
        }
    };

    const handleClaim = (e: React.MouseEvent, id: string, unlockFn: (id: any) => void) => {
        e.stopPropagation();
        if (!canClaim) return;

        playSuccessSound();
        unlockFn(id);
        setPendingUnlock(null);
        setCanClaim(false);
    };

    // Render Tab Content
    const renderContent = () => {
        let items: { id: string, name: string, color: string }[] = [];
        let unlocked: string[] = [];
        let selected: string = '';
        let unlockFn: (id: any) => void = () => { };
        let selectFn: (id: any) => void = () => { };
        let PreviewComponent: any = null;

        if (activeTab === 'dice') {
            items = AVAILABLE_DICE_SKINS;
            unlocked = unlockedSkins;
            selected = selectedSkin;
            unlockFn = onUnlock;
            selectFn = onSelect;
            PreviewComponent = ({ id }: { id: string }) => (
                <Dice value={6} size="medium" skin={id as DiceSkin} />
            );
        } else if (activeTab === 'card') {
            items = AVAILABLE_CARD_SKINS;
            unlocked = unlockedCardSkins;
            selected = selectedCardSkin;
            unlockFn = onUnlockCard;
            selectFn = onSelectCard;
            PreviewComponent = ({ id }: { id: string }) => (
                <div className={`preview-card card-back-${id}`}>
                    <div className="card-inner"></div>
                </div>
            );
        } else {
            items = AVAILABLE_BOARD_SKINS;
            unlocked = unlockedBoardSkins;
            selected = selectedBoardSkin;
            unlockFn = onUnlockBoard;
            selectFn = onSelectBoard;
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
                    const isPending = pendingUnlock === item.id;

                    return (
                        <div
                            key={item.id}
                            className={`skin-item ${isUnlocked ? 'unlocked' : 'locked'} ${isSelected ? 'selected' : ''} ${isPending ? 'pending' : ''}`}
                            onClick={() => handleSkinClick(item.id, isUnlocked, selectFn)}
                        >
                            <div className="skin-preview">
                                <PreviewComponent id={item.id} color={item.color} />
                            </div>
                            <div className="skin-name">{item.name}</div>
                            {!isUnlocked && !isPending && <div className="lock-icon">🔒</div>}
                            {isSelected && <div className="check-icon">✓</div>}

                            {isPending && (
                                <div className="claim-overlay">
                                    {canClaim ? (
                                        <button
                                            className="btn-claim pulse-animation"
                                            onClick={(e) => handleClaim(e, item.id, unlockFn)}
                                        >
                                            CLAIM
                                        </button>
                                    ) : (
                                        <div className="watching-text">Watching...</div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="skin-store-overlay">
            <div className="skin-store-modal">
                <button className="btn-close-x" onClick={() => { playClickSound(); onClose(); }}>×</button>
                <h2>Skin Shop</h2>
                <p className="store-subtitle">Watch ad: 3h Skin Unlock</p>

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
