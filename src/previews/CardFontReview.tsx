import { Card } from '../components/Card';
import type { Card as CardType, Rank, Suit } from '../logic/types';
import './CardFontReview.css';

const suits: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
const card = (rank: Rank, index: number): CardType => ({ id: `font-${rank}`, rank, suit: suits[index % suits.length], isHidden: false });
const featured = ([14, 13, 12, 11, 10] as Rank[]).map(card);
const deck = ([14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as Rank[]).map(card);
const aces: CardType[] = suits.map(suit => ({ id: `ace-${suit}`, rank: 14, suit }));

export function CardFontReview() {
    return (
        <main className="card-font-review">
            <header>
                <h1>Vectura / スートの比較</h1>
                <p>輪郭と色は共通です。中抜きと塗りつぶしを、同じカード・同じ大きさで比べられます。</p>
            </header>
            <div className="type-comparison">
                {([
                    { style: 'vectura', title: '中抜き', query: 'outline' },
                    { style: 'vectura-filled', title: '塗りつぶし（採用）', query: 'filled' },
                ] as const).map(({ style, title, query }) => (
                    <section key={style}>
                        <h2>{title}</h2>
                        <div className="suit-cards" aria-label={`${title}の4スート`}>{aces.map(item => <Card key={item.id} card={item} suitStyle={style} />)}</div>
                        <div className="featured-cards">{featured.map(item => <Card key={item.id} card={item} suitStyle={style} />)}</div>
                        <h3>盤面サイズ</h3>
                        <div className="compact-catalog">{deck.map(item => <Card key={item.id} card={item} size="xs" suitStyle={style} />)}</div>
                        <a href={`/?suit=${query}`} target="_blank" rel="noopener">このスートでホームを見る</a>
                    </section>
                ))}
            </div>
            <details>
                <summary>従来のカードと全ランクを見る</summary>
                <section>
                    <h2>これまで</h2>
                    <div className="featured-cards">{featured.map(item => <Card key={item.id} card={item} rankLettering={false} suitStyle="classic" />)}</div>
                </section>
                <section>
                    <h2>Vectura / Aから2まで</h2>
                    <div className="rank-catalog">{deck.map(item => <Card key={item.id} card={item} />)}</div>
                </section>
            </details>
        </main>
    );
}
