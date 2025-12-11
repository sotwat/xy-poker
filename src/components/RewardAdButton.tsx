import React, { useState } from 'react';

// Example for AppLixir or generic Rewarded Video
// You typically strip this out or replace with real SDK calls
interface RewardAdButtonProps {
    onReward: () => void;
    label?: string;
}

const RewardAdButton: React.FC<RewardAdButtonProps> = ({ onReward, label = "Watch Ad for Bonus" }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = () => {
        setIsLoading(true);

        // MOCK IMPLEMENTATION
        // In production, you would call:
        // invokeAppLixirVideoAd(options, callback);

        console.log("Requesting Reward Ad...");

        // Simulate 5 seconds ad
        setTimeout(() => {
            const success = window.confirm("Did the user watch the ad to the end? (Simulating Ad Network Callback)");
            setIsLoading(false);
            if (success) {
                onReward();
            }
        }, 2000);
    };

    return (
        <button
            onClick={handleClick}
            disabled={isLoading}
            style={{
                background: 'linear-gradient(45deg, #FFD700, #FFA500)',
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
                    <span>📺</span> {label}
                </>
            )}
        </button>
    );
};

export default RewardAdButton;
