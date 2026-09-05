import { useState } from 'react';
import { letteringSource } from '../homeLettering';
import './LetteringText.css';

function EnglishSegment({ text, layout = 'text' }: { text: string; layout?: 'text' | 'card-rank' }) {
    const source = letteringSource(layout, text);
    const [loaded, setLoaded] = useState('');
    return (
        <span className="lettering-text">
            <span className={loaded === source ? 'lettering-text-hidden' : undefined}>{text}</span>
            {text.length <= 32 && <img
                src={source}
                alt=""
                className="lettering-text-loader"
                onLoad={() => setLoaded(source)}
            />}
            {loaded === source && <span className="lettering-text-face" style={{ maskImage: `url("${source}")` }} aria-hidden="true" />}
        </span>
    );
}

export function LetteringText({ children, layout = 'text' }: { children: string; layout?: 'text' | 'card-rank' }) {
    if (layout === 'card-rank') return <EnglishSegment text={children} layout={layout} />;
    return children.split(/([\x20-\x7e]+)/).map((segment, index) => (
        /[A-Za-z0-9]/.test(segment) ? <EnglishSegment key={index} text={segment} /> : segment
    ));
}
