export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
    suit: Suit;
    rank: Rank;
    id: string; // Unique ID for React keys
    isHidden?: boolean; // For the "Hidden Card" rule
}

export type YHandType =
    | 'PureStraightFlush'
    | 'ThreeOfAKind'
    | 'StraightFlush'
    | 'PureStraight'
    | 'Flush'
    | 'PureOnePair'
    | 'Straight'
    | 'OnePair'
    | 'HighCard';

export type XHandType =
    | 'RoyalFlush'
    | 'StraightFlush'
    | 'FourOfAKind'
    | 'FullHouse'
    | 'Straight'
    | 'Flush'
    | 'ThreeOfAKind'
    | 'TwoPair'
    | 'OnePair'
    | 'HighCard';

export interface YHandResult {
    type: YHandType;
    score: number; // Dice value if won, 0 if lost
    rankValue: number; // For comparison (higher is better)
    kickers: number[]; // For tie-breaking
}

export interface XHandResult {
    type: XHandType;
    score: number;
    rankValue: number;
    kickers: number[];
}

export interface PlayerState {
    id: string;
    hand: Card[];
    board: (Card | null)[][]; // 3 rows x 5 cols
    dice: number[]; // 5 dice values
    score: number;
    hiddenCardsCount: number; // Max 3
    bonusesClaimed: number; // Count of bonuses won
    isPremium?: boolean;
}

export type Phase = 'setup' | 'playing' | 'scoring' | 'ended';

export interface GameState {
    players: [PlayerState, PlayerState];
    currentPlayerIndex: number;
    phase: Phase;
    deck: Card[];
    turnCount: number;
    winner: string | null; // Player ID
}

export type DiceSkin = 'white' | 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'black' | 'pink' | 'orange' | 'teal' | 'silver' | 'gold';
export type CardSkin = 'classic' | 'red-modern' | 'blue-modern' | 'gold-luxury' | 'cyber-neon' | 'dark-matter' | 'wood-grain' | 'matrix' | 'sunset' | 'royal-purple' | 'cool-mint' | 'dragon-scale';
export type BoardSkin = 'classic-green' | 'midnight-blue' | 'casino-red' | 'void-black' | 'neon-grid' | 'warm-wood' | 'ice-blue' | 'royal-gold' | 'cyber-punk' | 'minimal-grey' | 'space-station' | 'volcano';

export const AVAILABLE_DICE_SKINS: { id: DiceSkin; name: string; color: string }[] = [
    { id: 'white', name: 'Classic White', color: '#ffffff' },
    { id: 'red', name: 'Ruby Red', color: '#d32f2f' },
    { id: 'blue', name: 'Ocean Blue', color: '#1976d2' },
    { id: 'green', name: 'Emerald Green', color: '#388e3c' },
    { id: 'yellow', name: 'Solar Yellow', color: '#fbc02d' },
    { id: 'purple', name: 'Amethyst', color: '#7b1fa2' },
    { id: 'black', name: 'Obsidian', color: '#212121' },
    { id: 'pink', name: 'Neon Pink', color: '#e91e63' },
    { id: 'orange', name: 'Sunset Orange', color: '#f57c00' },
    { id: 'teal', name: 'Aqua Teal', color: '#00796b' },
    { id: 'silver', name: 'Chrome Silver', color: '#c0c0c0' },
    { id: 'gold', name: 'Pure Gold', color: '#ffd700' },
];

export const AVAILABLE_CARD_SKINS: { id: CardSkin; name: string; color: string }[] = [
    { id: 'classic', name: 'Classic Blue', color: '#2196f3' },
    { id: 'red-modern', name: 'Modern Red', color: '#f44336' },
    { id: 'blue-modern', name: 'Geometric Blue', color: '#3f51b5' },
    { id: 'gold-luxury', name: 'Luxury Gold', color: '#ffd700' },
    { id: 'cyber-neon', name: 'Cyber Neon', color: '#00e5ff' },
    { id: 'dark-matter', name: 'Dark Matter', color: '#202020' },
    { id: 'wood-grain', name: 'Oaken Wood', color: '#8d6e63' },
    { id: 'matrix', name: 'The Matrix', color: '#00c853' },
    { id: 'sunset', name: 'Vaporwave', color: '#ff4081' },
    { id: 'royal-purple', name: 'Royal Velvet', color: '#6200ea' },
    { id: 'cool-mint', name: 'Cool Mint', color: '#a7ffeb' },
    { id: 'dragon-scale', name: 'Dragon Scale', color: '#bf360c' },
];

export const AVAILABLE_BOARD_SKINS: { id: BoardSkin; name: string; color: string }[] = [
    { id: 'classic-green', name: 'Classic Felt', color: '#2e7d32' },
    { id: 'midnight-blue', name: 'Midnight', color: '#1a237e' },
    { id: 'casino-red', name: 'Casino Royale', color: '#b71c1c' },
    { id: 'void-black', name: 'The Void', color: '#000000' },
    { id: 'neon-grid', name: 'Retro Grid', color: '#263238' },
    { id: 'warm-wood', name: 'Mahogany', color: '#3e2723' },
    { id: 'ice-blue', name: 'Glacier', color: '#e0f7fa' },
    { id: 'royal-gold', name: 'VIP Room', color: '#fff8e1' },
    { id: 'cyber-punk', name: 'Night City', color: '#212121' },
    { id: 'minimal-grey', name: 'Minimalist', color: '#eeeeee' },
    { id: 'space-station', name: 'Space Station', color: '#cfd8dc' },
    { id: 'volcano', name: 'Volcano', color: '#3e2723' },
];
