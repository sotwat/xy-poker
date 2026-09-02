import type { XHandType, YHandType } from './types';

export const SHOWDOWN_VOICE_CHARACTERS = ['mana', 'tsukuyomi', 'kurowa'] as const;
export const SHOWDOWN_HAND_TYPES = [
    'PureStraightFlush',
    'ThreeOfAKind',
    'StraightFlush',
    'PureStraight',
    'Flush',
    'PureOnePair',
    'Straight',
    'OnePair',
    'HighCard',
    'RoyalFlush',
    'FourOfAKind',
    'FullHouse',
    'TwoPair',
] as const satisfies readonly (YHandType | XHandType)[];

export type ShowdownVoiceCharacter = typeof SHOWDOWN_VOICE_CHARACTERS[number];
export type ShowdownHandType = typeof SHOWDOWN_HAND_TYPES[number];
export type ShowdownVoiceAssignment = {
    p1: ShowdownVoiceCharacter;
    p2: ShowdownVoiceCharacter;
};

const HAND_FILE_NAMES: Record<ShowdownHandType, string> = {
    PureStraightFlush: 'pure-straight-flush',
    ThreeOfAKind: 'three-of-a-kind',
    StraightFlush: 'straight-flush',
    PureStraight: 'pure-straight',
    Flush: 'flush',
    PureOnePair: 'pure-one-pair',
    Straight: 'straight',
    OnePair: 'one-pair',
    HighCard: 'high-card',
    RoyalFlush: 'royal-flush',
    FourOfAKind: 'four-of-a-kind',
    FullHouse: 'full-house',
    TwoPair: 'two-pair',
};

function randomIndex(length: number, random: () => number): number {
    return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

/** Selects two distinct voices; P1 is blue and P2 is red. */
export function createRandomShowdownVoiceAssignment(random: () => number = Math.random): ShowdownVoiceAssignment {
    const available = [...SHOWDOWN_VOICE_CHARACTERS];
    const p1 = available.splice(randomIndex(available.length, random), 1)[0];
    const p2 = available[randomIndex(available.length, random)];
    return { p1, p2 };
}

export function normalizeShowdownVoiceAssignment(value: unknown): ShowdownVoiceAssignment | null {
    if (!value || typeof value !== 'object') return null;
    const assignment = value as Partial<ShowdownVoiceAssignment>;
    if (!SHOWDOWN_VOICE_CHARACTERS.includes(assignment.p1 as ShowdownVoiceCharacter)
        || !SHOWDOWN_VOICE_CHARACTERS.includes(assignment.p2 as ShowdownVoiceCharacter)
        || assignment.p1 === assignment.p2) return null;
    return { p1: assignment.p1!, p2: assignment.p2! };
}

export function getShowdownVoiceAssetPath(
    character: ShowdownVoiceCharacter,
    handType: ShowdownHandType,
): string {
    return `/showdown-voices/${character}/${HAND_FILE_NAMES[handType]}.m4a`;
}
