export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
    suit: Suit;
    rank: Rank;
    id: string; // Unique ID for React keys
    isJoker?: boolean;
    isHidden?: boolean; // For the "Hidden Card" rule
}

export type YHandType =
    | 'ThreeCardFlush' // Joker x2
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
