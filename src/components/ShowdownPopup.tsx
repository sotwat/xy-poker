import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ShowdownEffectSystem } from '../utils/showdownPostProcess';
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

// Classical Fractal Lightning generation algorithm
function drawLightning(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
    displace: number,
    color: string,
    width = 3
) {
    if (displace < 16) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.stroke();
    } else {
        // Find midpoint and displace it perpendicular to the line direction
        const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * displace;
        const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * displace;
        drawLightning(ctx, x1, y1, midX, midY, displace * 0.48, color, width);
        drawLightning(ctx, midX, midY, x2, y2, displace * 0.48, color, width);
    }
}

export const ShowdownPopup: React.FC<ShowdownPopupProps> = ({ data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const webglCanvasRef = useRef<HTMLCanvasElement>(null);
    const canvas2dRef = useRef<HTMLCanvasElement>(null);

    const [filterSeed, setFilterSeed] = useState(0);
    const [filterScale, setFilterScale] = useState(0);

    useEffect(() => {
        if (!data || !containerRef.current || !webglCanvasRef.current || !canvas2dRef.current) return;

        const width = containerRef.current.clientWidth || window.innerWidth;
        const height = containerRef.current.clientHeight || window.innerHeight;
        
        // 1. Initialize WebGL Particle and PostProcess system
        const webglSystem = new ShowdownEffectSystem(containerRef.current, webglCanvasRef.current);

        // 2. Set up Canvas 2D for fast 2D lightning / shockwave rings
        const canvas2d = canvas2dRef.current;
        canvas2d.width = width;
        canvas2d.height = height;
        const ctx2d = canvas2d.getContext('2d')!;

        let lightningRays: Array<{ angle: number; currentLength: number; targetLength: number; alpha: number }> = [];
        let shockwaveRadius = 0;
        let shockwaveAlpha = 0;
        let isSimulating2D = true;
        let lightningColor = data.winner === 'p1' ? '#00f2fe' : data.winner === 'p2' ? '#ff0844' : '#b300ff';

        const run2DLoop = () => {
            if (!isSimulating2D) return;
            ctx2d.clearRect(0, 0, width, height);

            // Set blending mode to additive (加算合成) for neon glows
            ctx2d.globalCompositeOperation = 'screen';

            const centerX = width / 2;
            const centerY = height / 2;

            // Draw Shockwave ring expanding outward from the center
            if (shockwaveAlpha > 0.01) {
                ctx2d.beginPath();
                ctx2d.arc(centerX, centerY, shockwaveRadius, 0, Math.PI * 2);
                ctx2d.strokeStyle = lightningColor;
                ctx2d.lineWidth = 12 * shockwaveAlpha;
                ctx2d.shadowColor = lightningColor;
                ctx2d.shadowBlur = 25 * shockwaveAlpha;
                ctx2d.globalAlpha = shockwaveAlpha;
                ctx2d.stroke();
                
                // Secondary outer ring
                ctx2d.beginPath();
                ctx2d.arc(centerX, centerY, shockwaveRadius * 1.15, 0, Math.PI * 2);
                ctx2d.strokeStyle = '#ffffff';
                ctx2d.lineWidth = 3 * shockwaveAlpha;
                ctx2d.stroke();

                ctx2d.globalAlpha = 1.0; // Reset
            }

            // Draw Fractal Lightnings
            lightningRays.forEach(ray => {
                if (ray.alpha > 0.05) {
                    const angleRad = ray.angle;
                    const endX = centerX + Math.cos(angleRad) * ray.currentLength;
                    const endY = centerY + Math.sin(angleRad) * ray.currentLength;

                    ctx2d.save();
                    ctx2d.globalAlpha = ray.alpha;
                    
                    // Main core (white/neon center)
                    drawLightning(ctx2d, centerX, centerY, endX, endY, ray.currentLength * 0.25, '#ffffff', 4);
                    // Aura wrapper (colored glowing path)
                    drawLightning(ctx2d, centerX, centerY, endX, endY, ray.currentLength * 0.28, lightningColor, 8);

                    ctx2d.restore();
                }
            });

            requestAnimationFrame(run2DLoop);
        };

        requestAnimationFrame(run2DLoop);

        // 3. Create GSAP Animation Timeline for Pachinko Cut-in
        const tl = gsap.timeline({
            onComplete: () => {
                isSimulating2D = false;
                webglSystem.destroy();
            }
        });

        // Initialize elements scale/opacity before anims start
        gsap.set('.showdown-popup-content', { scale: 0.1, opacity: 0 });
        gsap.set('.showdown-cutin-left', { xPercent: -120, skewX: -20 });
        gsap.set('.showdown-cutin-right', { xPercent: 120, skewX: -20 });
        gsap.set('.showdown-flash', { opacity: 0 });

        // Step A: Diagonal metal bands slide in at high speed and collide
        tl.to('.showdown-cutin-left', { xPercent: 0, duration: 0.24, ease: 'power2.in' })
          .to('.showdown-cutin-right', { xPercent: 0, duration: 0.24, ease: 'power2.in' }, '-=0.24');

        // Step B: The collision point! Triggers impact effects
        tl.add(() => {
            // Trigger 3D WebGL particle explosion
            webglSystem.triggerExplosion(data.winner, data.isXHand ? 1.5 : 1.0);

            // Launch Canvas 2D shockwaves and lightning bolts
            shockwaveRadius = 10;
            shockwaveAlpha = 1.0;
            gsap.to({ r: 10, a: 1.0 }, {
                r: Math.max(width, height) * 0.7,
                a: 0,
                duration: 0.8,
                ease: 'power1.out',
                onUpdate: function() {
                    shockwaveRadius = this.targets()[0].r;
                    shockwaveAlpha = this.targets()[0].a;
                }
            });

            // Initialize lightning rays pointing outward (4 rays instead of 8 for optimal performance)
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI / 2) + (Math.random() - 0.5) * 0.3;
                const length = Math.max(width, height) * (0.35 + Math.random() * 0.3);
                lightningRays.push({
                    angle: angle,
                    currentLength: 0,
                    targetLength: length,
                    alpha: 1.0
                });

                // Animate individual lightning paths grow & fade
                gsap.to(lightningRays[i], {
                    currentLength: length,
                    alpha: 0,
                    duration: 0.55 + Math.random() * 0.2,
                    ease: 'power3.out'
                });
            }

            // Screen Shake (激しく揺らして打撃感・期待感を表現)
            const appEl = document.querySelector('.app');
            if (appEl) {
                gsap.killTweensOf(appEl);
                gsap.set(appEl, { x: 0, y: 0 });
                gsap.to(appEl, {
                    x: () => (Math.random() - 0.5) * 35 * (data.isXHand ? 1.6 : 1.0),
                    y: () => (Math.random() - 0.5) * 35 * (data.isXHand ? 1.6 : 1.0),
                    duration: 0.05,
                    repeat: 14,
                    yoyo: true,
                    ease: 'none',
                    onComplete: () => {
                        gsap.set(appEl, { x: 0, y: 0 });
                    }
                });
            }
        });

        // Flash and content bounce-in
        tl.to('.showdown-flash', { opacity: 0.6, duration: 0.06 })
          .to('.showdown-flash', { opacity: 0, duration: 0.6, ease: 'power2.out' })
          .to('.showdown-popup-content', {
              scale: 1.15,
              opacity: 1,
              duration: 0.18,
              ease: 'back.out(2.0)'
          }, '-=0.55')
          .to('.showdown-popup-content', {
              scale: 1.0,
              duration: 0.12,
              ease: 'power2.out'
          });

        // Step C: Text distortion aura animation (Animate SVG filter variables)
        tl.add(() => {
            // Animate filter distortion scale
            gsap.to({ scale: 28 }, {
                scale: 6,
                duration: 0.9,
                ease: 'power2.out',
                onUpdate: function() {
                    setFilterScale(this.targets()[0].scale);
                }
            });

            // Continuously randomize fractal noise seeds for boiling vibration
            gsap.to({ seed: 0 }, {
                seed: 100,
                duration: 1.2,
                repeat: -1,
                ease: 'none',
                onUpdate: function() {
                    setFilterSeed(Math.floor(Math.random() * 1000));
                }
            });
        });

        // Step D: Idle sustain time & Outro fadeout
        tl.to('.showdown-popup-content', {
            scale: 1.35,
            skewX: 12,
            opacity: 0,
            duration: 0.28,
            ease: 'power2.in'
        }, '+=1.2')
        .to('.showdown-cutin-left', { xPercent: -120, duration: 0.22, ease: 'power2.in' }, '-=0.28')
        .to('.showdown-cutin-right', { xPercent: 120, duration: 0.22, ease: 'power2.in' }, '-=0.28');

        // Cleanup
        return () => {
            isSimulating2D = false;
            webglSystem.destroy();
            tl.kill();
        };
    }, [data]);

    if (!data) return null;

    const animKey = data.id;
    const winnerClass = data.winner === 'p1' ? 'popup-p1' : data.winner === 'p2' ? 'popup-p2' : 'popup-draw';

    return (
        <div className="showdown-popup-overlay" key={animKey} ref={containerRef}>
            {/* Background 2D Canvas (Shockwaves, lightnings) */}
            <canvas ref={canvas2dRef} className="showdown-canvas-2d" />

            {/* Background 3D WebGL Canvas (GPU Particles + Postprocess) */}
            <canvas ref={webglCanvasRef} className="showdown-canvas-webgl" />

            {/* Impact flash layer */}
            <div className="showdown-flash" />

            {/* Layer 5: Pachinko Diagonal Metal bands */}
            <div className={`showdown-cutin-left cutin-${data.winner} ${data.isXHand ? 'cutin-xhand' : ''}`} />
            <div className={`showdown-cutin-right cutin-${data.winner} ${data.isXHand ? 'cutin-xhand' : ''}`} />

            {/* SVG Filter for Lightning distortion */}
            <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
                <defs>
                    <filter id="pachinko-lightning-aura">
                        {/* Generate turbulence noise map */}
                        <feTurbulence 
                            type="fractalNoise" 
                            baseFrequency="0.06 0.18" 
                            numOctaves="3" 
                            result="noise" 
                            seed={filterSeed} 
                        />
                        {/* Distort coordinates of text based on noise map */}
                        <feDisplacementMap 
                            in="SourceGraphic" 
                            in2="noise" 
                            scale={filterScale} 
                            xChannelSelector="R" 
                            yChannelSelector="G" 
                            result="displaced" 
                        />
                        {/* Glow merge layer */}
                        <feGaussianBlur in="displaced" stdDeviation="2.5" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="displaced" />
                        </feMerge>
                    </filter>
                </defs>
            </svg>

            {/* Core Text DOM */}
            <div className={`showdown-popup-content ${winnerClass}`}>
                {data.isXHand ? (
                    <div className="popup-subtitle neon-text">X-HAND</div>
                ) : (
                    <div className="popup-subtitle neon-text">DICE: {data.diceValue}</div>
                )}
                
                {/* Applied SVG Turbulence filter wrapper */}
                <div className="popup-title-glow-wrapper">
                    <div 
                        className="popup-title aura-active" 
                        style={{ filter: 'url(#pachinko-lightning-aura)' }}
                    >
                        {data.text}
                    </div>
                </div>
            </div>
        </div>
    );
};
