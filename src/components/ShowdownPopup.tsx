import React from 'react';
import './ShowdownPopup.css';

export interface PopupData {
    id: string;
    text: string;
    winner: 'p1' | 'p2' | 'draw';
    diceValue?: number;
    isXHand: boolean;
}

interface ShowdownPopupProps {
    data: PopupData | null;
}

export const ShowdownPopup: React.FC<ShowdownPopupProps> = ({ data }) => {
    if (!data) return null;

    // We use a key to force re-mounting and re-triggering animations
    // whenever the text or state changes.
    const animKey = data.id;
    
    const winnerClass = data.winner === 'p1' ? 'popup-p1' : data.winner === 'p2' ? 'popup-p2' : 'popup-draw';

    return (
        <div className="showdown-popup-overlay" key={animKey}>
            <div className="showdown-flash"></div>
            <div className={`showdown-popup-content ${winnerClass}`}>
                {data.isXHand ? (
                    <div className="popup-subtitle">X-HAND</div>
                ) : (
                    <div className="popup-subtitle">DICE: {data.diceValue}</div>
                )}
                <div className="popup-title">{data.text}</div>
                
                {/* Visual Flair Elements */}
                <div className="popup-slash popup-slash-1"></div>
                <div className="popup-slash popup-slash-2"></div>
            </div>
        </div>
    );
};
