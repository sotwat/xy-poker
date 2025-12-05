import type { Card, Suit, Rank } from './types';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function createDeck(): Card[] {
    const deck: Card[] = [];

    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({
                suit,
                rank,
                id: `${suit}-${rank}`,
                isJoker: false,
            });
        }
    }

    // Jokers removed per user request
    // if (includeJokers) {
    //     deck.push({ suit: 'joker', rank: 15 as Rank, id: 'joker-1', isJoker: true }); // Rank 15 for sorting/logic if needed
    //     deck.push({ suit: 'joker', rank: 15 as Rank, id: 'joker-2', isJoker: true });
    // }

    return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
}

export function drawCards(deck: Card[], count: number): { drawn: Card[]; remaining: Card[] } {
    const drawn = deck.slice(0, count);
    const remaining = deck.slice(count);
    return { drawn, remaining };
}
