import React, { useState } from 'react';

// Monetag Rewarded Interstitial Integration
// 1. Add the Monetag Multi-Tag or Direct Rewarded Script to your index.html <head>
// 2. Use the window.monetag.showRewarded() or equivalent API provided in their dashboard.

const RewardAdButton: React.FC<{ onReward: () => void }> = ({ onReward }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = () => {
        setIsLoading(true);

        console.log("Requesting Monetag Reward Ad...");

        // ----------------------------------------------------------------
        // MONETAG INTEGRATION PLACEHOLDER
        // ----------------------------------------------------------------
        // Example:
        // if (window.showMonetagReward) {
        //    window.showMonetagReward().then(() => {
        //        onReward();
        //        setIsLoading(false);
        //    }).catch(() => setIsLoading(false));
        // }
        // ----------------------------------------------------------------

        // MOCK SIMULATION
        setTimeout(() => {
            // In real impl, this confirm disappears and the Ad SDK controls the flow
            const success = window.confirm("Monetag Mock: Did user watch ad? (Click OK to simulate Success)");
            setIsLoading(false);
            if (success) {
                onReward();
            }
        }, 1500);
    };

    return (
        <button
            onClick={handleClick}
            disabled={isLoading}
            style={{
                background: 'linear-gradient(45deg, #FF6B6B, #4ECDC4)', // Monetag-ish colors?
                border: 'none',
                borderRadius: '20px',
                padding: '10px 20px',
                color: '#fff',
                fontWeight: 'bold',
                cursor: isLoading ? 'wait' : 'pointer',
                boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}
        >
            {isLoading ? 'Loading Ad...' : (
                <>
                    <span>🎁</span> Watch Ad for Bonus
                </>
            )}
        </button>
    );
};

export default RewardAdButton;
