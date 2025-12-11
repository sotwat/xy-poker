import React from 'react';

interface MonetagBannerProps {
    width?: number; // Optional request, though Monetag is often responsive/overlay
    height?: number;
}

const MonetagBanner: React.FC<MonetagBannerProps> = ({ width = 320, height = 50 }) => {
    return (
        <div style={{ width: width, height: height, margin: '0 auto', display: 'flex', justifyContent: 'center' }}>
            <iframe
                src="/ad_content.html"
                width={width}
                height={height}
                style={{ border: 'none', overflow: 'hidden' }}
                scrolling="no"
                title="Sponsor"
            />
        </div>
    );
};

export default MonetagBanner;
