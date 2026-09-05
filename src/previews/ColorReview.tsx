import { useEffect, useRef, useState } from 'react';
import './ColorReview.css';

const directions = [
    { id: 'current', mark: '—', name: 'CURRENT', title: '変更前のデザイン', colors: ['#141122', '#3b3280', '#ffe66d'], detail: '紫と青の光、金色のロゴ、金属調のフレーム。背景模様の比較用です。' },
    { id: 'ink', mark: 'A', name: 'INK', title: '採用：INK配色＋CURRENTの模様', colors: ['#191c1b', '#ee503c', '#f1eee5'], detail: '墨色・朱赤・白の配色に、CURRENTの斜めの枠と細いラインを組み合わせました。' },
    { id: 'paper', mark: 'B', name: 'PAPER', title: '白い紙 × コバルト', colors: ['#e8e6dc', '#2949bd', '#202b46'], detail: '紙に刷った罫線と青いインク。明るい背景で、ボードゲームの道具らしさを出します。' },
    { id: 'clay', mark: 'C', name: 'CLAY', title: '赤土色 × 生成り', colors: ['#984431', '#e8d8b9', '#31251f'], detail: '段差のある色面と細い刻み。温かい背景に白いカードとダイスが浮かびます。' },
    { id: 'slate', mark: 'D', name: 'SLATE', title: '石板色 × ライム', colors: ['#444c50', '#d7ee69', '#202629'], detail: '5列を思わせる区切りと硬い面。ライムは対戦ボタンと選択中の場所に使います。' },
] as const;

function Screen({ palette, table, desktop }: { palette: string; table: boolean; desktop: boolean }) {
    const frame = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0);
    const width = desktop ? 740 : 390;
    const height = desktop ? 900 : 844;
    const src = `${table ? '/docs/color-table.html' : '/'}?palette=${palette}`;
    useEffect(() => {
        if (!frame.current) return;
        const observer = new ResizeObserver(entries => setScale(entries[0].contentRect.width / width));
        observer.observe(frame.current);
        return () => observer.disconnect();
    }, [width]);
    return <div className="color-screen" ref={frame} style={{ aspectRatio: `${width} / ${height}` }}>
        <iframe key={src} title={`${palette} / ${table ? '対戦画面' : 'ホーム画面'}`} src={src} width={width} height={height} inert tabIndex={-1} style={{ transform: `scale(${scale})` }} />
    </div>;
}

export function ColorReview() {
    const [table, setTable] = useState(false);
    const [desktop, setDesktop] = useState(false);
    const [showCurrent, setShowCurrent] = useState(true);
    return <main className="color-review">
        <header className="color-review-header">
            <div>
                <p className="review-kicker">XY POKER / COLOR STUDY</p>
                <h1>色と背景の4案</h1>
                <p className="review-intro">配置・Vectura・カード・ダイスは共通。背景の構成と、色や光沢の使い方を変えています。</p>
            </div>
            <span className="review-status">ローカル比較案</span>
        </header>
        <div className="color-toolbar">
            <div className="color-switch" role="group" aria-label="比較する画面">
                <button type="button" aria-pressed={!table} onClick={() => setTable(false)}>HOME</button>
                <button type="button" aria-pressed={table} onClick={() => setTable(true)}>TABLE</button>
            </div>
            <div className="color-switch" role="group" aria-label="画面サイズ">
                <button type="button" aria-pressed={!desktop} onClick={() => setDesktop(false)}>PHONE</button>
                <button type="button" aria-pressed={desktop} onClick={() => setDesktop(true)}>PC</button>
            </div>
            <label><input type="checkbox" checked={showCurrent} onChange={event => setShowCurrent(event.target.checked)} />現在の案も表示</label>
        </div>
        <div className="color-options">
            {directions.filter(direction => showCurrent || direction.id !== 'current').map(direction => <section className="color-option" key={direction.id}>
                <div className="color-option-heading"><span>{direction.mark}</span><div><h2>{direction.name}</h2><p>{direction.title}</p></div></div>
                <Screen palette={direction.id} table={table} desktop={desktop} />
                <div className="color-swatches" aria-label="主な配色">{direction.colors.map(color => <span key={color} style={{ backgroundColor: color }} title={color} />)}</div>
                <p className="color-detail">{direction.detail}</p>
                <a className="color-open" href={`/?palette=${direction.id}`} target="_blank" rel="noopener noreferrer">{direction.id === 'current' ? '現在の画面を開く' : 'この配色で遊ぶ'}</a>
            </section>)}
        </div>
        <footer className="color-review-footer">
            <p>採用案はA・INKです。配色はINK、背景の模様はCURRENTを使い、ホームと対戦画面に反映しています。</p>
            <p>TABLEは実コンポーネントを使った比較用の同一盤面です。「この配色で遊ぶ」から実際の対戦も確認できます。その他の候補はローカル比較用です。</p>
            <p>参照確認：<a href="https://poker-chase.com/" target="_blank" rel="noopener noreferrer">ポーカーチェイス公式サイト</a>。今回の背景はXY Poker用に作図しています。</p>
        </footer>
    </main>;
}
