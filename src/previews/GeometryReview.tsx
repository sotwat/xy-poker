import { useEffect, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { Dice } from '../components/Dice';
import { HomeIcon } from '../components/HomeIcon';
import { homeLettering } from '../homeLettering';
import type { UiGeometry } from '../uiGeometry';
import './GeometryReview.css';

const versions = [
    { geometry: 'original', title: '現在' },
    { geometry: 'angular', title: '角ばった案' },
] as const;
const menu = ['skins', 'rules', 'account', 'contact'] as const;

function HomeFrame({ geometry, phone }: { geometry: UiGeometry; phone: boolean }) {
    const wrapper = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0);
    const width = phone ? 390 : 884;
    const height = phone ? 844 : 862;
    useEffect(() => {
        if (!wrapper.current) return;
        const observer = new ResizeObserver(entries => setScale(entries[0].contentRect.width / width));
        observer.observe(wrapper.current);
        return () => observer.disconnect();
    }, [width]);
    return (
        <div className="geometry-frame" ref={wrapper} style={{ aspectRatio: `${width} / ${height}` }}>
            <iframe title={`${geometry === 'angular' ? '角ばった案' : '現在'}のホーム画面`} src={`/?geometry=${geometry}`} width={width} height={height} tabIndex={-1} inert style={{ transform: `scale(${scale})` }} />
        </div>
    );
}

export function GeometryReview() {
    const [phone, setPhone] = useState(false);
    return (
        <main className="geometry-review">
            <header>
                <div><h1>角のデザイン比較</h1><p>Vecturaと塗りつぶしスートは共通です。</p></div>
                <div className="viewport-switch" role="group" aria-label="ホーム画面の表示サイズ">
                    <button type="button" aria-pressed={!phone} onClick={() => setPhone(false)}>PC</button>
                    <button type="button" aria-pressed={phone} onClick={() => setPhone(true)}>スマホ</button>
                </div>
            </header>
            <div className="geometry-columns">
                {versions.map(({ geometry, title }) => (
                    <section key={geometry}>
                        <h2>{title}</h2>
                        <div className="geometry-parts">
                            <div className="geometry-pieces">
                                <div className="geometry-cards">
                                    <Card card={{ id: 'geometry-ace', rank: 14, suit: 'spades' }} geometry={geometry} />
                                    <Card card={{ id: 'geometry-ten', rank: 10, suit: 'hearts' }} geometry={geometry} />
                                </div>
                                <div className="geometry-dice" aria-label="1から6のダイス">{[1, 2, 3, 4, 5, 6].map(value => <Dice key={value} value={value} geometry={geometry} />)}</div>
                            </div>
                            <div className="geometry-menu">
                                {menu.map(name => <div key={name}><HomeIcon name={name} geometry={geometry} /><img src={homeLettering[name]} alt={name.toUpperCase()} /></div>)}
                            </div>
                        </div>
                        <HomeFrame geometry={geometry} phone={phone} />
                        <a href={`/?geometry=${geometry}`} target="_blank" rel="noopener">{title}を実際の画面で開く</a>
                    </section>
                ))}
            </div>
        </main>
    );
}
