import React from 'react';
import './Dice.css';

interface DiceProps {
    value: number;
    size?: 'small' | 'medium' | 'large';
    className?: string;
}

export const Dice: React.FC<DiceProps> = ({ value, size = 'medium', className = '' }) => {
    // Map value to dot positions
    // ...
    const renderDots = () => {
        // ... (same as before)
        const dots = [];
        if (value === 1 || value === 3 || value === 5) dots.push(<div key="c" className="dot center" />);
        if (value >= 2) {
            dots.push(<div key="tl" className="dot top-left" />);
            dots.push(<div key="br" className="dot bottom-right" />);
        }
        if (value >= 4) {
            dots.push(<div key="tr" className="dot top-right" />);
            dots.push(<div key="bl" className="dot bottom-left" />);
        }
        if (value === 6) {
            dots.push(<div key="ml" className="dot middle-left" />);
            dots.push(<div key="mr" className="dot middle-right" />);
        }
        return dots;
    };

    return (
        <div className={`dice ${size} ${className}`}>
            {renderDots()}
        </div>
    );
};
