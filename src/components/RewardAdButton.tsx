import React, { useState } from 'react';

// Monetag Rewarded Interstitial Integration
// 1. Add the Monetag Multi-Tag or Direct Rewarded Script to your index.html <head>
// 2. Use the window.monetag.showRewarded() or equivalent API provided in their dashboard.

const RewardAdButton: React.FC<{ onReward: () => void }> = ({ onReward }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = () => {
        setIsLoading(true);

        // Open Monetag Direct Link in new tab
        window.open('https://otieu.com/4/10307496', '_blank');

        // Since we can't reliably track if they "finished" watching a direct link ad (it's just a page),
        // we simulate a reward after a delay or immediately upon return.
        // For simple Direct Link, the act of clicking is often the "conversion" or step.
        // We'll set a timeout to re-enable the button or give reward.

        setTimeout(() => {
            // Automagically grant reward after 5 seconds of "processing"
            // In a real Direct Link flow, you might want to show a "Claim" button afterwards.
            const success = window.confirm("Did you visit the ad page? Click OK to claim reward.");
            setIsLoading(false);
            if (success) {
                onReward();
            }
        }, 3000);
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
