import type { XHandResult, XHandType } from './types';

export function getXHandBaseScore(type: XHandType): number {
    switch (type) {
        case 'RoyalFlush': return 1000; // Special Win
        case 'StraightFlush': return 16;
        case 'FourOfAKind': return 14;
        case 'FullHouse': return 12;
        case 'Straight': return 10;
        case 'Flush': return 8;
        case 'ThreeOfAKind': return 6;
        case 'TwoPair': return 4;
        case 'OnePair': return 2;
        case 'HighCard': return 0;
        default: return 0;
    }
}

export function calculateXHandScores(p1Res: XHandResult, p2Res: XHandResult): { p1Score: number, p2Score: number } {
    let p1Score = getXHandBaseScore(p1Res.type);
    let p2Score = getXHandBaseScore(p2Res.type);

    // Compare for +1 bonus (ONLY if same hand type)
    if (p1Res.rankValue === p2Res.rankValue) {
        // Same hand type (e.g. both Flush), check kickers
        let p1Wins = false;
        let p2Wins = false;
        for (let k = 0; k < Math.max(p1Res.kickers.length, p2Res.kickers.length); k++) {
            const k1 = p1Res.kickers[k] || 0;
            const k2 = p2Res.kickers[k] || 0;
            if (k1 > k2) { p1Wins = true; break; }
            if (k2 > k1) { p2Wins = true; break; }
        }
        if (p1Wins) p1Score += 1;
        else if (p2Wins) p2Score += 1;
    }

    return { p1Score, p2Score };
}
