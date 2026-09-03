export type ShowdownSoundWinner = 'p1' | 'p2' | 'draw';

export interface ShowdownSoundTimeline {
    cardEntries: number[];
    cardImpacts: number[];
    energyBurst: number;
    titleImpact: number;
    winnerConfirm: number;
    voiceStart: number;
    cleanup: number;
}

export interface CardWhooshProfile {
    duration: number;
    bodyFromFrequency: number;
    bodyToFrequency: number;
    airFromFrequency: number;
    airToFrequency: number;
    toneFromFrequency: number;
    toneToFrequency: number;
    bodyVolume: number;
    airVolume: number;
    toneVolume: number;
}

const MAX_SHOWDOWN_CARDS = 5;
const CARD_ENTRY_START = 0.15;
const CARD_STAGGER = 0.11;
const CARD_IMPACT_OFFSET = 0.405;

/**
 * Audio timing in seconds, matched to ShowdownPopup's finite CSS animations.
 * Keeping this pure makes the audiovisual contract regression-testable.
 */
export function getShowdownSoundTimeline(
    cardCount: number,
    isFinalHand: boolean,
): ShowdownSoundTimeline {
    const safeCardCount = Math.min(MAX_SHOWDOWN_CARDS, Math.max(0, Math.trunc(cardCount)));
    const cardEntries = Array.from(
        { length: safeCardCount },
        (_, index) => CARD_ENTRY_START + index * CARD_STAGGER,
    );

    return {
        cardEntries,
        cardImpacts: cardEntries.map(entry => entry + CARD_IMPACT_OFFSET),
        energyBurst: 0.48,
        titleImpact: 0.78,
        winnerConfirm: isFinalHand ? 1.1 : 1.02,
        voiceStart: isFinalHand ? 1.2 : 1.08,
        cleanup: isFinalHand ? 2.5 : 2.2,
    };
}

export function getShowdownWinnerChord(winner: ShowdownSoundWinner): readonly number[] {
    if (winner === 'p1') return [523.25, 659.25, 783.99];
    if (winner === 'p2') return [440, 523.25, 659.25];
    return [466.16, 587.33, 698.46];
}

/** A high, fast two-layer air sweep plus a pitched edge accent for each card. */
export function getCardWhooshProfile(cardIndex: number, isFinalHand: boolean): CardWhooshProfile {
    const index = Math.min(MAX_SHOWDOWN_CARDS - 1, Math.max(0, Math.trunc(cardIndex)));
    return {
        duration: isFinalHand ? 0.34 : 0.31,
        bodyFromFrequency: 820 + index * 95,
        bodyToFrequency: 5_600 + index * 280,
        airFromFrequency: 1_900 + index * 120,
        airToFrequency: 8_200 + index * 320,
        toneFromFrequency: 340 + index * 18,
        toneToFrequency: 2_600 + index * 180,
        bodyVolume: isFinalHand ? 0.29 : 0.26,
        airVolume: isFinalHand ? 0.17 : 0.15,
        toneVolume: isFinalHand ? 0.075 : 0.068,
    };
}
