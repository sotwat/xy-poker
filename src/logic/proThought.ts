import type { Phase } from './types';

interface ProThoughtAvailabilityParams {
    isPremium: boolean;
    mode: 'local' | 'online';
    phase: Phase;
}

interface ProThoughtTimerPauseParams {
    isAvailable: boolean;
    isEditorOpen: boolean;
    currentPlayerIndex: number;
    controlledPlayerIndex: number;
}

export function canUseProThoughtJournal(params: ProThoughtAvailabilityParams): boolean {
    return params.isPremium && params.mode === 'local' && params.phase === 'playing';
}

export function shouldPauseTurnTimerForProThought(params: ProThoughtTimerPauseParams): boolean {
    return params.isAvailable
        && params.isEditorOpen
        && params.currentPlayerIndex === params.controlledPlayerIndex;
}
