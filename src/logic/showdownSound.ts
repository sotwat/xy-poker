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
