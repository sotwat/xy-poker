import React from 'react';
import './Dice.css';
import type { DiceSkin } from '../logic/types';

interface DiceProps {
    value: number;
    size?: 'small' | 'medium' | 'large';
    className?: string;
    skin?: DiceSkin;
}

export const Dice: React.FC<DiceProps> = ({ value, size = 'medium', className = '', skin = 'white' }) => {
    // Map value to dot positions
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
        <div className={`dice ${size} ${className} ${skin}`}>
            {renderDots()}
        </div>
    );
};
