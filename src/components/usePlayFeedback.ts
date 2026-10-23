import { useCallback, useEffect, useRef } from 'react';
import type { GameState } from '../logic/types';
import { createResultAudio } from '../utils/resultAudio';

type FeedbackState = { playing: boolean; placed: number; myTurn: boolean };

export function usePlayFeedback(state: GameState, mySeat: number) {
    const audioRef = useRef<ReturnType<typeof createResultAudio> | null>(null);
    const previous = useRef<FeedbackState | null>(null);
    const playing = state.phase === 'playing';
    const placed = state.players.reduce((count, player) => count + player.board.flat().filter(Boolean).length, 0);
    const myTurn = state.currentPlayerIndex === mySeat;

    useEffect(() => {
        const audio = createResultAudio();
        audioRef.current = audio;
        const onVisibility = () => { if (document.hidden) audio.stop(); };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            audio.dispose();
            audioRef.current = null;
        };
    }, []);

    useEffect(() => {
        const before = previous.current;
        previous.current = { playing, placed, myTurn };
        if (!playing) { audioRef.current?.stop(); return; }
        if (before?.playing && placed > before.placed) audioRef.current?.play('tick', 0.24, 0.72);
        if (myTurn && (!before?.playing || !before.myTurn)) audioRef.current?.play('reveal', 0.12);
    }, [playing, placed, myTurn]);

    return useCallback(() => audioRef.current?.play('tick', 0.12), []);
}
