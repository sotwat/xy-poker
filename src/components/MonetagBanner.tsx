import React, { useEffect, useRef } from 'react';

interface MonetagBannerProps {
    width?: number; // Optional request, though Monetag is often responsive/overlay
    height?: number;
}

const MonetagBanner: React.FC<MonetagBannerProps> = ({ width = 320, height = 50 }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Clear previous
        container.innerHTML = '';

        // Monetag often uses a global script for Vignette/Interstitial which goes in <head>.
        // However, for "In-Page Push" or specific banner zones, you might use a script here.

        // IF you are using a standard Banner Zone (if enabled for your account):
        const iframe = document.createElement('iframe');
        iframe.width = `${width}`;
        iframe.height = `${height}`;
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        iframe.scrolling = 'no';

        container.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>body { margin: 0; display: flex; justify-content: center; align-items: center; background: #fafafa; font-family: sans-serif; font-size: 10px; color: #aaa; }</style>
                </head>
                <body>
                    <!-- PASTE YOUR MONETAG BANNER/IN-PAGE ZONE SCRIPT HERE -->
                    <div style="text-align: center;">
                        MONETAG BANNER SPACE<br>
                        (Paste Script in components/MonetagBanner.tsx)
                    </div>
                    
                    <!-- Example:
                    <script src="https://alwingulla.com/link/to/your/script"></script>
                    -->
                </body>
                </html>
            `);
            doc.close();
        }
    }, [width, height]);

    return (
        <div ref={containerRef} style={{ width: width, height: height, margin: '0 auto' }} />
    );
};

export default MonetagBanner;
