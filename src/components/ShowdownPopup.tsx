import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Card } from './Card';
import type { Card as CardType } from '../logic/types';
import './ShowdownPopup.css';

export interface PopupData {
    id: string;
    text: string;
    winner: 'p1' | 'p2' | 'draw';
    diceValue?: number;
    isXHand: boolean;
    cards?: CardType[];
}

interface ShowdownPopupProps {
    data: PopupData | null;
}

// Map hand names/text into valid file name suffixes
function getAssetPath(data: PopupData): string {
    const baseDir = '/effects'; // Resolves to public/effects/ in Vite

    if (data.winner === 'draw') {
        return `${baseDir}/draw.webp`;
    }

    const prefix = data.winner === 'p1' ? 'p1' : 'p2';

    if (data.isXHand) {
        return `${baseDir}/${prefix}_xhand.webp`;
    }

    // Normalize text: "Full House" -> "full_house"
    const handKey = data.text.toLowerCase().replace(/\s+/g, '_');

    const knownHands = [
        'high_card', 'one_pair', 'two_pair', 'three_of_a_kind',
        'straight', 'flush', 'full_house', 'four_of_a_kind',
        'straight_flush', 'royal_flush'
    ];

    if (knownHands.includes(handKey)) {
        return `${baseDir}/${prefix}_${handKey}.webp`;
    }

    // Default fallback to general dice win
    return `${baseDir}/${prefix}_dice_win.webp`;
}

export const ShowdownPopup: React.FC<ShowdownPopupProps> = ({ data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const assetRef = useRef<HTMLImageElement>(null);

    const [assetFailed, setAssetFailed] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (!data) return;

        setAssetFailed(false);
        setIsLoaded(false);

        // GSAP timeline for Pachinko Cut-in, Shaking, and Card entry sequence
        const tl = gsap.timeline();

        // 1. Initial State Setup
        gsap.set('.showdown-popup-content', { scale: 0.1, opacity: 0 });
        gsap.set('.showdown-cutin-left', { xPercent: -120, skewX: -20 });
        gsap.set('.showdown-cutin-right', { xPercent: 120, skewX: -20 });
        gsap.set('.showdown-flash', { opacity: 0 });
        gsap.set('.aura-active', { x: 0, y: 0 });
        
        // Reset card wrapper animation states
        gsap.set('.showdown-card-wrapper', {
            x: -150,
            y: 120,
            rotation: -30,
            scale: 0.4,
            opacity: 0
        });

        // Step A: Diagonal metal bands slide in at high speed and collide
        tl.to('.showdown-cutin-left', { xPercent: 0, duration: 0.22, ease: 'power2.in' })
          .to('.showdown-cutin-right', { xPercent: 0, duration: 0.22, ease: 'power2.in' }, '-=0.22');

        // Step B: Collision Point! Shaking, Flash & Text entry
        tl.add(() => {
            // Intense screen shake on collision (Pachinko impact)
            const appEl = document.querySelector('.app');
            if (appEl) {
                gsap.killTweensOf(appEl);
                gsap.set(appEl, { x: 0, y: 0 });
                gsap.to(appEl, {
                    x: () => (Math.random() - 0.5) * 35 * (data.isXHand ? 1.5 : 1.0),
                    y: () => (Math.random() - 0.5) * 35 * (data.isXHand ? 1.5 : 1.0),
                    duration: 0.05,
                    repeat: 14,
                    yoyo: true,
                    ease: 'none',
                    onComplete: () => {
                        gsap.set(appEl, { x: 0, y: 0 });
                    }
                });
            }

            // High frequency micro-vibration of text/effect (Boiling vibration)
            gsap.to('.aura-active', {
                x: () => (Math.random() - 0.5) * 8,
                y: () => (Math.random() - 0.5) * 8,
                duration: 0.04,
                repeat: -1,
                yoyo: true,
                ease: 'none'
            });
        });

        // Flash & content bounce-in
        tl.to('.showdown-flash', { opacity: 0.6, duration: 0.05 })
          .to('.showdown-flash', { opacity: 0, duration: 0.5, ease: 'power2.out' })
          .to('.showdown-popup-content', {
              scale: 1.15,
              opacity: 1,
              duration: 0.16,
              ease: 'back.out(2.2)'
          }, '-=0.48')
          .to('.showdown-popup-content', {
              scale: 1.0,
              duration: 0.1,
              ease: 'power2.out'
          });

        // Step C: Card Staggered Slide-in Animation (Pachinko Card Lift-up)
        if (data.cards && data.cards.length > 0) {
            const count = data.cards.length;
            tl.fromTo('.showdown-card-wrapper', 
                {
                    x: -150,
                    y: 120,
                    rotation: -30,
                    scale: 0.4,
                    opacity: 0
                },
                {
                    x: 0,
                    y: 0,
                    rotation: (i) => (i - (count - 1) / 2) * 6, // Fan-out angles (-6, 0, 6 etc)
                    scale: 1.0,
                    opacity: 1,
                    duration: 0.35,
                    stagger: 0.08,
                    ease: 'back.out(1.8)'
                },
                '-=0.2' // Start slightly before the main popup content completes its bounce
            );
        }

        // Step D: Idle sustain and Outro fadeout
        tl.to('.showdown-popup-content', {
            scale: 1.35,
            skewX: 12,
            opacity: 0,
            duration: 0.26,
            ease: 'power2.in'
        }, '+=1.6') // Marginally increased sustain to fully appreciate cards
        .to('.showdown-cutin-left', { xPercent: -120, duration: 0.2, ease: 'power2.in' }, '-=0.26')
        .to('.showdown-cutin-right', { xPercent: 120, duration: 0.2, ease: 'power2.in' }, '-=0.26');

        // Cleanup
        return () => {
            tl.kill();
            gsap.killTweensOf('.aura-active');
            const appEl = document.querySelector('.app');
            if (appEl) {
                gsap.killTweensOf(appEl);
                gsap.set(appEl, { x: 0, y: 0 });
            }
        };
    }, [data]);

    if (!data) return null;

    const animKey = data.id;
    const winnerClass = data.winner === 'p1' ? 'popup-p1' : data.winner === 'p2' ? 'popup-p2' : 'popup-draw';
    const assetPath = getAssetPath(data);

    // X-Hand styling variables
    const isXHand = data.isXHand;
    const xHandClass = isXHand ? `popup-xhand-${data.winner}` : '';

    return (
        <div className="showdown-popup-overlay" key={animKey} ref={containerRef}>
            {/* Impact flash layer */}
            <div className="showdown-flash" />

            {/* Pachinko Diagonal Metal bands */}
            <div className={`showdown-cutin-left cutin-${data.winner} ${isXHand ? 'cutin-xhand-' + data.winner : ''}`} />
            <div className={`showdown-cutin-right cutin-${data.winner} ${isXHand ? 'cutin-xhand-' + data.winner : ''}`} />

            {/* Core Display Content */}
            <div className={`showdown-popup-content ${winnerClass} ${xHandClass}`} ref={contentRef}>
                {isXHand ? (
                    <div className="popup-subtitle neon-text">X-HAND</div>
                ) : (
                    <div className="popup-subtitle neon-text">DICE: {data.diceValue}</div>
                )}

                {/* Pre-rendered Animation Asset (APNG / WebP) */}
                {!assetFailed && (
                    <div className="showdown-asset-container aura-active">
                        <img 
                            ref={assetRef}
                            src={assetPath} 
                            alt={`${data.winner} ${data.text}`}
                            className={`showdown-asset-effect ${isLoaded ? 'loaded' : 'loading'}`}
                            onLoad={() => setIsLoaded(true)}
                            onError={() => setAssetFailed(true)} // Falls back to HTML/CSS text rendering on load fail
                        />
                    </div>
                )}

                {/* Lightweight CSS Text Fallback (Active if image fails to load or is placeholder) */}
                {(assetFailed || !isLoaded) && (
                    <div className="popup-title-glow-wrapper aura-active">
                        <div className="popup-title">
                            {data.text}
                        </div>
                    </div>
                )}

                {/* Active Winning Hand Cards (Sliding-in dynamically) */}
                {data.cards && data.cards.length > 0 && (
                    <div className="showdown-cards-container">
                        {data.cards.map((card, idx) => (
                            <div 
                                key={card.id || idx} 
                                className="showdown-card-wrapper"
                                style={{ zIndex: idx + 5 }} // Ensure nice layering left-to-right
                            >
                                <Card card={card} size="normal" isHidden={false} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
