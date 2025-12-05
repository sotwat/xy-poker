import React from 'react';
import './Dice.css';

interface DiceProps {
    value: number;
}

export const Dice: React.FC<DiceProps> = ({ value }) => {
    // Map value to dot positions
    // 1: center
    // 2: top-left, bottom-right
    // 3: top-left, center, bottom-right
    // 4: corners
    // 5: corners + center
    // 6: 2 rows of 3

    const renderDots = () => {
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
        <div className="dice">
            {renderDots()}
        </div>
    );
};
