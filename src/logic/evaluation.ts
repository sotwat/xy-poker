import type { Card, Rank, YHandResult, XHandResult, XHandType } from './types';

// --- Helpers ---

const getRankValue = (rank: Rank): number => (rank === 14 ? 14 : rank); // A is 14 usually
// Special A rule for straights: A can be 1 (low) or 14 (high).
// In our Rank type, A is 14.

// --- Y Hand Evaluation (3 Cards) ---

export function evaluateYHand(originalCards: Card[], diceValue: number): YHandResult {
    // Placeholder for variables that would be defined at the start of the function
    // (e.g., ranks, suits, isFlush, isStraight, isPair, isTrips, straightHigh, sortedRanks)
    // These are assumed to be defined by the context where this snippet is inserted.
    // For a complete function, these would need to be computed from originalCards.

    // Example placeholder definitions (these would be actual logic in a full function)
    const cards = [...originalCards];
    const ranks = cards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
    const suits = cards.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);

    let isStraight = false;
    let straightHigh = 0;
    // Check for standard straight (e.g., 2-3-4, 12-13-14)
    if (ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2]) {
        isStraight = true;
        straightHigh = ranks[2];
    }
    // Check for A-2-3 straight (A=14, 2, 3)
    if (!isStraight && ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 14) {
        isStraight = true;
        straightHigh = 3; // A-2-3, 3 is the high card
    }

    let isPair = false;
    let isTrips = false;
    let isPair01 = false;
    let isPair12 = false;

    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) {
        isTrips = true;
    } else if (ranks[0] === ranks[1]) {
        isPair = true;
        isPair01 = true;
    } else if (ranks[1] === ranks[2]) {
        isPair = true;
        isPair12 = true;
    } else if (ranks[0] === ranks[2]) { // Split pair
        isPair = true;
    }

    const sortedRanks = [...ranks].sort((a, b) => b - a); // High to low

    // 1. Three Card Flush (Special for Y Hand)
    // This hand type is not in the provided snippet, but would typically be the highest.
    // Assuming it's handled elsewhere or not applicable in this specific re-ordering.

    // 2. Three of a Kind
    if (isTrips) {
        return { type: 'ThreeOfAKind', score: diceValue, rankValue: 8, kickers: [ranks[0]] };
    }

    // 3. Straight Flush
    // Flush, Straight, but NOT Ordered (otherwise matched Pure above)
    if (isFlush && isStraight) {
        return { type: 'StraightFlush', score: diceValue, rankValue: 7, kickers: [straightHigh] };
    }

    // 4. Pure Straight
    // Straight, Ordered, Mixed Suits.
    if (isStraight && !isFlush) {
        // Use POSITIONAL ranks for "Pure" check (Row 0, 1, 2)
        const posRanks = cards.map(c => getRankValue(c.rank));

        const isAsc = posRanks[0] + 1 === posRanks[1] && posRanks[1] + 1 === posRanks[2];
        const isDesc = posRanks[0] - 1 === posRanks[1] && posRanks[1] - 1 === posRanks[2];

        // A-2-3 checks (A=14)
        const isA23Asc = posRanks[0] === 14 && posRanks[1] === 2 && posRanks[2] === 3; // A-2-3 (Top to Bottom)
        const is32ADesc = posRanks[0] === 3 && posRanks[1] === 2 && posRanks[2] === 14; // 3-2-A (Top to Bottom)

        if (isAsc || isDesc || isA23Asc || is32ADesc) {
            return { type: 'PureStraight', score: diceValue, rankValue: 6, kickers: [straightHigh] };
        }
    }

    // 5. Flush
    if (isFlush) {
        return { type: 'Flush', score: diceValue, rankValue: 5, kickers: sortedRanks.reverse() };
    }

    // 6. Pure One Pair
    // Pair is Adjacent.
    if (isPair) {
        // Use POSITIONAL ranks check
        const posRanks = cards.map(c => getRankValue(c.rank));
        const isAdj01 = posRanks[0] === posRanks[1];
        const isAdj12 = posRanks[1] === posRanks[2];

        if (isAdj01 || isAdj12) {
            // Adjacent
            const pairRank = isPair01 ? ranks[0] : ranks[1];
            const kicker = isPair01 ? ranks[2] : ranks[0];
            return { type: 'PureOnePair', score: diceValue, rankValue: 4, kickers: [pairRank, kicker] };
        }
    }

    // 7. Straight
    // Straight but unordered and unsuited
    if (isStraight) {
        return { type: 'Straight', score: diceValue, rankValue: 3, kickers: [straightHigh] };
    }

    // 8. One Pair
    // Split Pair (0 and 2)
    if (isPair) {
        const pairRank = ranks[0]; // 0 and 2 match
        const kicker = ranks[1];
        return { type: 'OnePair', score: diceValue, rankValue: 2, kickers: [pairRank, kicker] };
    }

    // 9. High Card
    return { type: 'HighCard', score: diceValue, rankValue: 1, kickers: sortedRanks.reverse() };
}

// --- X Hand Evaluation (5 Cards) ---
// Simplified for brevity, assuming standard poker logic + Jokers
// We can use a library or write a standard evaluator.
// Since we need to handle Jokers, custom is probably needed.

// --- X Hand Evaluation (5 Cards) ---

export function evaluateXHand(originalCards: Card[]): XHandResult {
    const cards = [...originalCards];

    // Helper to check standard poker hand
    const checkPokerHand = (currentCards: Card[]): { type: XHandType; kickers: number[] } => {
        const ranks = currentCards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
        const suits = currentCards.map(c => c.suit);

        const isFlush = suits.every(s => s === suits[0]);

        let isStraight = true;
        for (let i = 0; i < 4; i++) {
            if (ranks[i] + 1 !== ranks[i + 1]) {
                isStraight = false;
                break;
            }
        }
        // A-5 Straight (A, 2, 3, 4, 5) -> Ranks: 2, 3, 4, 5, 14
        if (!isStraight && ranks[4] === 14 && ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 4 && ranks[3] === 5) {
            isStraight = true;
        }

        const counts: Record<number, number> = {};
        ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
        const countValues = Object.values(counts).sort((a, b) => b - a); // 4,1 or 3,2 or 3,1,1 etc.

        // Royal Flush
        if (isFlush && isStraight && ranks[0] === 10 && ranks[4] === 14) {
            return { type: 'RoyalFlush', kickers: [] };
        }

        // Straight Flush
        if (isFlush && isStraight) {
            return { type: 'StraightFlush', kickers: [ranks[4]] }; // Highest card
        }

        // Four of a Kind
        if (countValues[0] === 4) {
            const fourRank = Number(Object.keys(counts).find(k => counts[Number(k)] === 4));
            const kicker = Number(Object.keys(counts).find(k => counts[Number(k)] === 1));
            return { type: 'FourOfAKind', kickers: [fourRank, kicker] };
        }

        // Full House
        if (countValues[0] === 3 && countValues[1] === 2) {
            const threeRank = Number(Object.keys(counts).find(k => counts[Number(k)] === 3));
            const twoRank = Number(Object.keys(counts).find(k => counts[Number(k)] === 2));
            return { type: 'FullHouse', kickers: [threeRank, twoRank] };
        }

        // Flush
        if (isFlush) {
            return { type: 'Flush', kickers: ranks.reverse() };
        }

        // Straight
        if (isStraight) {
            // Handle 5-high straight kicker
            if (ranks[4] === 14 && ranks[0] === 2) {
                return { type: 'Straight', kickers: [5] };
            }
            return { type: 'Straight', kickers: [ranks[4]] };
        }

        // Three of a Kind
        if (countValues[0] === 3) {
            const threeRank = Number(Object.keys(counts).find(k => counts[Number(k)] === 3));
            const others = ranks.filter(r => r !== threeRank).reverse();
            return { type: 'ThreeOfAKind', kickers: [threeRank, ...others] };
        }

        // Two Pair
        if (countValues[0] === 2 && countValues[1] === 2) {
            const pairs = Object.keys(counts).filter(k => counts[Number(k)] === 2).map(Number).sort((a, b) => b - a);
            const kicker = Number(Object.keys(counts).find(k => counts[Number(k)] === 1));
            return { type: 'TwoPair', kickers: [...pairs, kicker] };
        }

        // One Pair
        if (countValues[0] === 2) {
            const pairRank = Number(Object.keys(counts).find(k => counts[Number(k)] === 2));
            const others = ranks.filter(r => r !== pairRank).reverse();
            return { type: 'OnePair', kickers: [pairRank, ...others] };
        }

        // High Card
        return { type: 'HighCard', kickers: ranks.reverse() };
    };

    const getXHandRankValue = (type: XHandType): number => {
        switch (type) {
            case 'RoyalFlush': return 10;
            case 'StraightFlush': return 9;
            case 'FourOfAKind': return 8;
            case 'FullHouse': return 7;
            case 'Flush': return 6;
            case 'Straight': return 5;
            case 'ThreeOfAKind': return 4;
            case 'TwoPair': return 3;
            case 'OnePair': return 2;
            case 'HighCard': return 1;
        }
    };

    const res = checkPokerHand(cards);
    return {
        type: res.type,
        score: 0,
        rankValue: getXHandRankValue(res.type),
        kickers: res.kickers,
    };
}
