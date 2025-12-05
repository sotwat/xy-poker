import type { Card, Rank, Suit, YHandResult, XHandResult, YHandType, XHandType } from './types';

// --- Helpers ---

const getRankValue = (rank: Rank): number => (rank === 14 ? 14 : rank); // A is 14 usually
// Special A rule for straights: A can be 1 (low) or 14 (high).
// In our Rank type, A is 14.

function isJoker(card: Card): boolean {
    return card.suit === 'joker';
}



// --- Y Hand Evaluation (3 Cards) ---

export function evaluateYHand(originalCards: Card[], diceValue: number): YHandResult {
    const cards = [...originalCards];
    const jokers = cards.filter(isJoker);
    const nonJokers = cards.filter(c => !isJoker(c));
    const jokerCount = jokers.length;

    // 1. Three Card Flush (2 Jokers)
    if (jokerCount >= 2) {
        // Strongest Y hand.
        // Kickers: Max card.
        // If 3 jokers (impossible with 1 deck? No, deck has 2 jokers. 3rd card must be normal).
        // If 2 jokers, 3rd card is kicker.
        const kicker = nonJokers.length > 0 ? getRankValue(nonJokers[0].rank) : 15;
        return {
            type: 'ThreeCardFlush',
            score: diceValue,
            rankValue: 10,
            kickers: [kicker],
        };
    }

    // Helper to check properties on specific substituted cards
    const checkHand = (currentCards: Card[]): { type: YHandType; kickers: number[] } | null => {
        // Check Pure (No Jokers allowed for Pure ranks based on assumption)
        // But we are passing substituted cards here.
        // So we need to know if original had jokers.
        const hasJoker = jokerCount > 0;

        const isFlush = currentCards[0].suit === currentCards[1].suit && currentCards[1].suit === currentCards[2].suit;

        const ranks = currentCards.map(c => c.rank);
        const sortedRanks = [...ranks].sort((a, b) => a - b);

        // Check Straight
        // Handle A-2-3 (A=14, 2=2, 3=3).
        // If we have 14, 2, 3 -> treated as 1, 2, 3.
        let isStraight = false;
        let straightHigh = sortedRanks[2];

        if (sortedRanks[0] + 1 === sortedRanks[1] && sortedRanks[1] + 1 === sortedRanks[2]) {
            isStraight = true;
        } else if (sortedRanks.includes(14) && sortedRanks.includes(2) && sortedRanks.includes(3)) {
            isStraight = true;
            straightHigh = 3; // A, 2, 3 -> 3 is high (in this game? "Weakest straight: A, 2, 3")
            // Wait, "Weakest straight: A, 2, 3". So high card is 3? Or is it ranked lower than 2-3-4?
            // Usually 3-high straight is lowest.
        }

        // Check Three of a Kind
        const isTrips = ranks[0] === ranks[1] && ranks[1] === ranks[2];

        // Check Pairs
        // For Y hand, we need to know placement for "Pure One Pair" vs "One Pair".
        // currentCards preserves order? Yes, we should pass them in order.
        const isPair01 = ranks[0] === ranks[1];
        const isPair12 = ranks[1] === ranks[2];
        const isPair02 = ranks[0] === ranks[2];
        const isPair = isTrips ? false : (isPair01 || isPair12 || isPair02);

        // --- Ranking ---

        // 2. Pure Straight Flush
        // Must be No Joker, Flush, Straight, Ordered (Asc or Desc).
        if (!hasJoker && isFlush && isStraight) {
            const isAsc = ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2];
            const isDesc = ranks[0] - 1 === ranks[1] && ranks[1] - 1 === ranks[2];
            // Special case A-2-3 ordered?
            // A(14), 2, 3 -> Not ordered mathematically.
            // But A can be 1.
            // 1, 2, 3 (Asc) -> A, 2, 3?
            // 3, 2, 1 (Desc) -> 3, 2, A?
            // If ranks are [14, 2, 3], they are NOT ordered in value.
            // We need to check if they effectively form a sequence.
            // Let's handle A as 1 for order check.


            // Check A-2-3 specific order
            // Case: A, 2, 3 (Asc)
            const isA23Asc = ranks[0] === 14 && ranks[1] === 2 && ranks[2] === 3;
            const is32ADesc = ranks[0] === 3 && ranks[1] === 2 && ranks[2] === 14;

            if (isAsc || isDesc || isA23Asc || is32ADesc) {
                return { type: 'PureStraightFlush', kickers: [straightHigh] };
            }
        }

        // 3. Three of a Kind
        if (isTrips) {
            return { type: 'ThreeOfAKind', kickers: [ranks[0]] };
        }

        // 4. Straight Flush
        if (isFlush && isStraight) {
            return { type: 'StraightFlush', kickers: [straightHigh] };
        }

        // 5. Pure Straight
        // No Joker, Straight, Ordered, Mixed Suits (Not Flush).
        if (!hasJoker && isStraight && !isFlush) {
            const isAsc = ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2];
            const isDesc = ranks[0] - 1 === ranks[1] && ranks[1] - 1 === ranks[2];
            // A-2-3 checks
            const isA23Asc = ranks[0] === 14 && ranks[1] === 2 && ranks[2] === 3;
            const is32ADesc = ranks[0] === 3 && ranks[1] === 2 && ranks[2] === 14;

            if (isAsc || isDesc || isA23Asc || is32ADesc) {
                return { type: 'PureStraight', kickers: [straightHigh] };
            }
        }

        // 6. Flush
        if (isFlush) {
            // Kickers: High to Low
            return { type: 'Flush', kickers: sortedRanks.reverse() };
        }

        // 7. Pure One Pair
        // No Joker, Pair is Adjacent.
        if (!hasJoker && isPair) {
            if (isPair01 || isPair12) {
                // Adjacent
                const pairRank = isPair01 ? ranks[0] : ranks[1];
                const kicker = isPair01 ? ranks[2] : ranks[0];
                return { type: 'PureOnePair', kickers: [pairRank, kicker] };
            }
        }

        // 8. Straight
        if (isStraight) {
            return { type: 'Straight', kickers: [straightHigh] };
        }

        // 9. One Pair
        if (isPair) {
            // If we are here, it's either because it has Joker (so not Pure) or it's Split (so not Pure).
            let pairRank = 0;
            let kicker = 0;
            if (isPair01) { pairRank = ranks[0]; kicker = ranks[2]; }
            else if (isPair12) { pairRank = ranks[1]; kicker = ranks[0]; }
            else { pairRank = ranks[0]; kicker = ranks[1]; } // Split pair 0-2
            return { type: 'OnePair', kickers: [pairRank, kicker] };
        }

        // 10. High Card
        return { type: 'HighCard', kickers: sortedRanks.reverse() };
    };

    // Iterate Joker substitutions
    // If 0 Jokers, just check once.
    // If 1 Joker, try all 52 cards (or just needed ones).
    // Optimization: With 1 Joker, we can try replacing it with every rank (2-14) and every suit (4).
    // Actually, suit only matters for Flush.
    // We can try:
    // 1. Replace with same suit as other cards (for Flush/SF).
    // 2. Replace with different suit (for Straight/Trips).
    // 3. Replace with specific ranks to complete Straight/Pair.

    // Brute force is safe for 1 Joker (13 ranks * 4 suits = 52 checks).

    let bestHand: { type: YHandType; kickers: number[]; rankValue: number } | null = null;

    const getHandRankValue = (type: YHandType): number => {
        switch (type) {
            case 'ThreeCardFlush': return 10;
            case 'PureStraightFlush': return 9;
            case 'ThreeOfAKind': return 8;
            case 'StraightFlush': return 7;
            case 'PureStraight': return 6;
            case 'Flush': return 5;
            case 'PureOnePair': return 4;
            case 'Straight': return 3;
            case 'OnePair': return 2;
            case 'HighCard': return 1;
        }
    };

    const compareHands = (a: { type: YHandType; kickers: number[] }, b: { type: YHandType; kickers: number[] }) => {
        const valA = getHandRankValue(a.type);
        const valB = getHandRankValue(b.type);
        if (valA !== valB) return valA - valB;

        // Compare kickers
        for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
            const kA = a.kickers[i] || 0;
            const kB = b.kickers[i] || 0;
            if (kA !== kB) return kA - kB;
        }
        return 0;
    };

    if (jokerCount === 0) {
        const res = checkHand(cards);
        if (res) {
            bestHand = { ...res, rankValue: getHandRankValue(res.type) };
        }
    } else {
        // 1 Joker (we handled 2+ Jokers at top)
        // Find index of Joker
        const jokerIdx = cards.findIndex(isJoker);
        const possibleSuits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
        const possibleRanks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

        for (const s of possibleSuits) {
            for (const r of possibleRanks) {
                const substituted = [...cards];
                substituted[jokerIdx] = { suit: s, rank: r, id: 'sub', isJoker: false }; // Mock card
                const res = checkHand(substituted);
                if (res) {
                    const resWithVal = { ...res, rankValue: getHandRankValue(res.type) };
                    if (!bestHand || compareHands(resWithVal, bestHand) > 0) {
                        bestHand = resWithVal;
                    }
                }
            }
        }
    }

    if (!bestHand) throw new Error("Failed to evaluate hand");

    return {
        type: (bestHand as any).type,
        score: diceValue, // Logic outside will handle win/loss
        rankValue: (bestHand as any).rankValue,
        kickers: (bestHand as any).kickers,
    };
}

// --- X Hand Evaluation (5 Cards) ---
// Simplified for brevity, assuming standard poker logic + Jokers
// We can use a library or write a standard evaluator.
// Since we need to handle Jokers, custom is probably needed.

// --- X Hand Evaluation (5 Cards) ---

export function evaluateXHand(originalCards: Card[]): XHandResult {
    const cards = [...originalCards];
    const jokers = cards.filter(isJoker);
    const jokerCount = jokers.length;

    // Helper to check standard poker hand (5 cards, no jokers)
    const checkPokerHand = (currentCards: Card[]): { type: XHandType; kickers: number[] } | null => {
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
            // In 5-high straight, 5 is high.
            // But for sorting purposes, we might want to treat A as 1?
            // Standard poker: 5-high straight is lowest straight.
            // We'll handle kickers carefully.
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

    const compareXHands = (a: { type: XHandType; kickers: number[] }, b: { type: XHandType; kickers: number[] }) => {
        const valA = getXHandRankValue(a.type);
        const valB = getXHandRankValue(b.type);
        if (valA !== valB) return valA - valB;
        for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
            const kA = a.kickers[i] || 0;
            const kB = b.kickers[i] || 0;
            if (kA !== kB) return kA - kB;
        }
        return 0;
    };

    // Joker Substitution
    if (jokerCount === 0) {
        const res = checkPokerHand(cards);
        if (!res) throw new Error("Evaluation failed");
        return {
            type: res.type,
            score: 0, // Calculated outside
            rankValue: getXHandRankValue(res.type),
            kickers: res.kickers,
        };
    } else {
        // 1 or 2 Jokers.
        // Optimization: We only need to try replacing Jokers with cards that improve the hand.
        // Trying all 52 cards for 2 jokers is 52*52 = 2704 checks. Fast enough.

        let bestHand: { type: XHandType; kickers: number[]; rankValue: number } | null = null;
        const jokerIndices = cards.map((c, i) => isJoker(c) ? i : -1).filter(i => i !== -1);

        const possibleSuits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
        const possibleRanks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

        // Recursive substitution
        const substitute = (index: number, currentCards: Card[]) => {
            if (index >= jokerIndices.length) {
                const res = checkPokerHand(currentCards);
                if (res) {
                    const resWithVal = { ...res, rankValue: getXHandRankValue(res.type) };
                    if (!bestHand || compareXHands(resWithVal, bestHand) > 0) {
                        bestHand = resWithVal;
                    }
                }
                return;
            }

            const cardIdx = jokerIndices[index];
            // Optimization: If we have 2 jokers, we might be doing redundant checks.
            // But let's keep it simple.

            // Create a copy of currentCards for this branch of recursion
            const nextCards = [...currentCards];

            for (const s of possibleSuits) {
                for (const r of possibleRanks) {
                    nextCards[cardIdx] = { suit: s, rank: r, id: 'sub', isJoker: false };
                    substitute(index + 1, nextCards);
                }
            }
        };

        substitute(0, [...cards]);

        if (!bestHand) throw new Error("Evaluation failed");

        return {
            type: (bestHand as any).type,
            score: 0,
            rankValue: (bestHand as any).rankValue,
            kickers: (bestHand as any).kickers,
        };
    }
}
