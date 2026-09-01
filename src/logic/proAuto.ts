import type { Phase } from './types';

export type PlayerRole = 'host' | 'guest' | null;

export function getControlledPlayerIndex(isOnlineGame: boolean, playerRole: PlayerRole): 0 | 1 {
    return isOnlineGame && playerRole === 'guest' ? 1 : 0;
}

interface ProAutoPlacementContext {
    isPremium: boolean;
    isAutoPlay: boolean;
    phase: Phase;
    currentPlayerIndex: number;
    controlledPlayerIndex: number;
    showDiceAnimation: boolean;
    isTurnAnnouncementVisible: boolean;
}

export function shouldProAutoPlace({
    isPremium,
    isAutoPlay,
    phase,
    currentPlayerIndex,
    controlledPlayerIndex,
    showDiceAnimation,
    isTurnAnnouncementVisible,
}: ProAutoPlacementContext): boolean {
    return isPremium
        && isAutoPlay
        && phase === 'playing'
        && currentPlayerIndex === controlledPlayerIndex
        && !showDiceAnimation
        && !isTurnAnnouncementVisible;
}

interface ProAutoTurnSelectionContext {
    isPremium: boolean;
    isAutoPlay: boolean;
    phase: Phase;
    chooserIndex: number | null;
    controlledPlayerIndex: number;
    showDiceAnimation: boolean;
    isTossingCoin: boolean;
}

export function shouldProAutoChooseTurn({
    isPremium,
    isAutoPlay,
    phase,
    chooserIndex,
    controlledPlayerIndex,
    showDiceAnimation,
    isTossingCoin,
}: ProAutoTurnSelectionContext): boolean {
    return isPremium
        && isAutoPlay
        && phase === 'turn_selection'
        && chooserIndex === controlledPlayerIndex
        && !showDiceAnimation
        && !isTossingCoin;
}
