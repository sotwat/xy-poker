import { useState, type CSSProperties } from 'react';
import { letteringSource } from '../homeLettering';
import './LetteringText.css';

function EnglishSegment({ text, layout = 'text' }: { text: string; layout?: 'text' | 'card-rank' }) {
    const source = letteringSource(layout, text);
    const [image, setImage] = useState({ source: '', aspect: 1 });
    const loaded = image.source === source;
    return (
        <span className="lettering-text" data-lettering-ready={loaded || undefined} style={{ '--lettering-aspect': image.aspect } as CSSProperties}>
            <span className={loaded ? 'lettering-text-hidden' : undefined}>{text}</span>
            {text.length <= 32 && <img
                src={source}
                alt=""
                className="lettering-text-loader"
                onLoad={event => setImage({ source, aspect: event.currentTarget.naturalWidth / event.currentTarget.naturalHeight })}
            />}
            {loaded && <span className="lettering-text-face" style={{ maskImage: `url("${source}")` }} aria-hidden="true" />}
        </span>
    );
}

export function LetteringText({ children, layout = 'text' }: { children: string; layout?: 'text' | 'card-rank' }) {
    if (layout === 'card-rank') return <EnglishSegment text={children} layout={layout} />;
    return children.split(/([\x20-\x7e]+)/).map((segment, index) => (
        /[A-Za-z0-9]/.test(segment) ? segment.length <= 32
            ? <EnglishSegment key={index} text={segment} />
            : segment.split(/(\s+)/).map((word, part) => /\S/.test(word)
                ? <EnglishSegment key={`${index}-${part}`} text={word} /> : word)
            : segment
    ));
}
