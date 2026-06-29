import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// Collaborative AI Learning Database APIs
// ==========================================

export interface GlobalAiParams {
    trip_preference: number;
    flush_preference: number;
    straight_preference: number;
    x_hand_focus: number;
    bonus_aggression: number;
    defensive_awareness: number;
}

export async function fetchGlobalAiParameters(): Promise<GlobalAiParams | null> {
    try {
        const { data, error } = await supabase
            .from('ai_global_parameters')
            .select('*')
            .eq('id', 1)
            .single();
        if (error) {
            console.error('[Supabase] Error fetching global AI parameters:', error);
            return null;
        }
        return data as GlobalAiParams;
    } catch (e) {
        console.error('[Supabase] Failed to fetch global AI parameters:', e);
        return null;
    }
}

export async function updateGlobalAiParameters(aiWon: boolean, isDraw: boolean = false): Promise<void> {
    try {
        const current = await fetchGlobalAiParameters();
        if (!current) return;

        const updated = { ...current } as any;
        updated.total_games = (current as any).total_games + 1;

        if (isDraw) {
            // Draw: just increment games played
        } else if (aiWon) {
            updated.ai_wins = (current as any).ai_wins + 1;
            // AI Won: reinforcement learning increment (mild to stabilize public pool updates)
            updated.trip_preference *= 1.015;
            updated.flush_preference *= 1.015;
            updated.straight_preference *= 1.015;
            updated.x_hand_focus *= 1.015;
            updated.bonus_aggression *= 1.015;
        } else {
            // AI Lost: shift preferences away from weakest
            const strategies = [
                { name: 'trip_preference', value: current.trip_preference },
                { name: 'flush_preference', value: current.flush_preference },
                { name: 'straight_preference', value: current.straight_preference },
                { name: 'x_hand_focus', value: current.x_hand_focus },
                { name: 'bonus_aggression', value: current.bonus_aggression },
            ];
            strategies.sort((a, b) => a.value - b.value);
            const weakest = strategies[0].name;
            const strongest = strategies[strategies.length - 1].name;

            updated[weakest] *= 1.04;
            updated[strongest] *= 0.985;
            updated.bonus_aggression *= 1.02;
        }

        // Clip parameters to safe ranges
        updated.trip_preference = Math.min(Math.max(updated.trip_preference, 0.5), 2.0);
        updated.flush_preference = Math.min(Math.max(updated.flush_preference, 0.5), 2.0);
        updated.straight_preference = Math.min(Math.max(updated.straight_preference, 0.5), 2.0);
        updated.x_hand_focus = Math.min(Math.max(updated.x_hand_focus, 0.5), 2.0);
        updated.bonus_aggression = Math.min(Math.max(updated.bonus_aggression, 0.5), 2.5);
        updated.defensive_awareness = Math.min(Math.max(updated.defensive_awareness, 0.4), 1.5);
        updated.updated_at = new Date().toISOString();

        const { error } = await supabase
            .from('ai_global_parameters')
            .update({
                total_games: updated.total_games,
                ai_wins: updated.ai_wins,
                trip_preference: updated.trip_preference,
                flush_preference: updated.flush_preference,
                straight_preference: updated.straight_preference,
                x_hand_focus: updated.x_hand_focus,
                bonus_aggression: updated.bonus_aggression,
                defensive_awareness: updated.defensive_awareness,
                updated_at: updated.updated_at
            })
            .eq('id', 1);

        if (error) {
            console.error('[Supabase] Error updating global AI parameters:', error);
        } else {
            console.log('[Supabase] Successfully contributed game outcome to Global AI Learning pool!');
        }
    } catch (e) {
        console.error('[Supabase] Failed to update global AI parameters:', e);
    }
}
