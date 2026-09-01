import { createClient } from '@supabase/supabase-js';
import { socket } from './logic/online';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
});

export interface GlobalAiParams {
    id: number;
    total_games: number;
    ai_wins: number;
    trip_preference: number;
    flush_preference: number;
    straight_preference: number;
    x_hand_focus: number;
    bonus_aggression: number;
    defensive_awareness: number;
    pure_preference: number;
    trips_in_hand_focus: number;
    row3_delay_focus: number;
    showdown_delay_focus: number;
    low_card_avoidance: number;
    turn_order_flexibility: number;
    weak_hand_avoidance: number;
    pair_in_hand_scale: number;
    queen_first_scale: number;
    bluff_bonus_scale: number;
    hiding_strategy: number;
    trash_bin_rush_scale: number;
    updated_at: string;
}

export async function fetchGlobalAiParameters(): Promise<GlobalAiParams | null> {
    try {
        const { data, error } = await supabase
            .from('ai_global_parameters')
            .select('*')
            .eq('id', 1)
            .single();
        if (error) throw error;
        return data as GlobalAiParams;
    } catch (error) {
        console.error('Unable to fetch global AI parameters:', error);
        return null;
    }
}

export async function updateGlobalAiParameters(aiWon: boolean, isDraw = false, gameToken?: string): Promise<void> {
    if (!socket.connected) return;
    await new Promise<void>(resolve => {
        socket.timeout(3_000).emit(
            'update_ai_parameters',
            { aiWon, isDraw, gameToken },
            (error: Error | null, response?: { success: boolean }) => {
                if (error || !response?.success) {
                    console.error('Unable to contribute AI result:', error || 'Request rejected');
                }
                resolve();
            },
        );
    });
}
