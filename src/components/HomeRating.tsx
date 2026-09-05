import { useState } from 'react';
import { letteringSource } from '../homeLettering';

export function HomeRating({ value }: { value: number }) {
    const source = letteringSource('rating', String(Math.round(value)));
    const [loaded, setLoaded] = useState('');
    return (
        <strong className="home-rating-number">
            <span className={loaded === source ? 'rating-text-hidden' : undefined}>{value}</span>
            <img
                src={source}
                alt=""
                className={loaded === source ? 'rating-image-ready' : undefined}
                onLoad={() => setLoaded(source)}
            />
        </strong>
    );
}
