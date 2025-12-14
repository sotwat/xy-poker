import React, { useEffect } from 'react';
import { playGachaSoundSequence } from '../utils/sound';
import './GachaReveal.css';

interface GachaRevealProps {
    results: { type: string, id: string }[];
    onClose: () => void;
}

export const GachaReveal: React.FC<GachaRevealProps> = ({ results, onClose }) => {

    useEffect(() => {
        playGachaSoundSequence();
    }, []);

    const isMulti = results.length > 1;

    return (
        <div className="gacha-reveal-overlay" onClick={onClose}>
            <div className={`gacha-reveal-content ${isMulti ? 'multi-reveal' : 'single-reveal'}`} onClick={(e) => e.stopPropagation()}>
                <h2>{isMulti ? 'Gacha Results!' : 'New Skin Unlocked!'}</h2>

                <div className="results-grid">
                    {results.map((item, idx) => (
                        <div key={idx} className="reveal-item">
                            <div className={`reveal-preview type-${item.type} skin-${item.id}`}>
                                {item.type === 'dice' && <div className="icon">🎲</div>}
                                {item.type === 'card' && <div className="icon">🃏</div>}
                                {item.type === 'board' && <div className="icon">🏁</div>}
                            </div>
                            <div className="reveal-name">{item.id}</div>
                        </div>
                    ))}
                </div>

                <div className="reveal-sparkles">
                    <div className="sparkle s1">✨</div>
                    <div className="sparkle s2">✨</div>
                    <div className="sparkle s3">✨</div>
                </div>

                <button className="btn-collect" onClick={onClose}>Collect</button>
            </div>
        </div>
    );
};
