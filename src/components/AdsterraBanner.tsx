import React, { useEffect, useRef } from 'react';

interface AdsterraBannerProps {
    width?: number;
    height?: number;
}

const AdsterraBanner: React.FC<AdsterraBannerProps> = ({ width = 728, height = 90 }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Clear previous
        container.innerHTML = '';

        // Create an iframe to sandbox the ad script (which might use document.write)
        const iframe = document.createElement('iframe');
        iframe.width = `${width}`;
        iframe.height = `${height}`;
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        iframe.scrolling = 'no';

        container.appendChild(iframe);

        // Write the ad script into the iframe
        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>body { margin: 0; display: flex; justify-content: center; align-items: center; background: #fafafa; }</style>
                </head>
                <body>
                    <!-- PASTE YOUR ADSTERRA SCRIPT HERE -->
                    <div style="color: #999; font-family: sans-serif; font-size: 12px; text-align: center;">
                        ADSTERRA BANNER<br>
                        (Paste Script in components/AdsterraBanner.tsx)
                    </div>
                    
                    <!-- Example Script Format: -->
                    <!--
                    <script type="text/javascript">
                        atOptions = {
                            'key' : 'YOUR_KEY',
                            'format' : 'iframe',
                            'height' : ${height},
                            'width' : ${width},
                            'params' : {}
                        };
                    </script>
                    <script type="text/javascript" src="//www.highperformanceformat.com/YOUR_KEY/invoke.js"></script>
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

export default AdsterraBanner;
