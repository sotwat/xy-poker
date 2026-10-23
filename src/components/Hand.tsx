import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import type { Card as CardType } from '../logic/types';
import { Card } from './Card';
import './Hand.css';

interface HandProps {
    hand: CardType[];
    selectedCardId?: string | null;
    onCardSelect: (cardId: string) => void;
    isCurrentPlayer?: boolean;
    isOpponent?: boolean;
    isHidden?: boolean;
    onCardClick?: () => void; // Fallback if different from onCardSelect
}

export const Hand: React.FC<HandProps> = ({
    hand,
    selectedCardId,
    onCardSelect,
    isCurrentPlayer = false,
    isOpponent = false,
    isHidden = false,
    onCardClick
}) => {
    const handRef = useRef<HTMLDivElement>(null);
    const previousCards = useRef(new Set<string>());

    useLayoutEffect(() => {
        const entries = [...(handRef.current?.querySelectorAll<HTMLElement>('[data-hand-card]') ?? [])];
        const arriving = entries.filter(entry => !previousCards.current.has(entry.dataset.handCard!));
        previousCards.current = new Set(hand.map(card => card.id));
        if (!arriving.length) return;
        const media = gsap.matchMedia();
        media.add('(prefers-reduced-motion: no-preference)', () => {
            gsap.fromTo(arriving, { x: 16, y: 8, opacity: 0 }, {
                x: 0, y: 0, opacity: 1, duration: 0.24,
                stagger: 0.045, ease: 'power3.out', clearProps: 'transform,opacity',
            });
        });
        return () => media.revert();
    }, [hand]);

    return (
        <div ref={handRef} className={`hand ${isCurrentPlayer ? 'active' : ''} ${isOpponent ? 'opponent' : ''}`}>
            {hand.map((card) => (
                <div 
                    key={card.id} 
                    className="hand-card-wrapper"
                    data-hand-card={card.id}
                >
                    <Card
                        card={card}
                        isSelected={selectedCardId === card.id}
                        onClick={() => {
                            if (isCurrentPlayer && onCardSelect) onCardSelect(card.id);
                            else if (onCardClick) onCardClick();
                        }}
                        isPlayable={isCurrentPlayer}
                        isHidden={isHidden}
                    />
                </div>
            ))}
        </div>
    );
};
