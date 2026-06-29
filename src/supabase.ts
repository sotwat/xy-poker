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
    // strategy.md compliant heuristics
    pure_preference: number;
    trips_in_hand_focus: number;
    row3_delay_focus: number;
    showdown_delay_focus: number;
    low_card_avoidance: number;
    turn_order_flexibility: number;
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
            // Draw: increment games played only
        } else if (aiWon) {
            updated.ai_wins = (current as any).ai_wins + 1;
            // AI Won: Reinforce currently active tactics slightly
            updated.trip_preference *= 1.015;
            updated.flush_preference *= 1.015;
            updated.straight_preference *= 1.015;
            updated.x_hand_focus *= 1.015;
            updated.bonus_aggression *= 1.015;
            updated.pure_preference *= 1.012;
            updated.trips_in_hand_focus *= 1.012;
            updated.row3_delay_focus *= 1.012;
            updated.showdown_delay_focus *= 1.012;
            updated.low_card_avoidance *= 1.012;
            updated.turn_order_flexibility *= 1.012;
        } else {
            // AI Lost: Adjust heuristics. Shift away from weakest/strongest extremes
            const strategies = [
                { name: 'trip_preference', value: current.trip_preference },
                { name: 'flush_preference', value: current.flush_preference },
                { name: 'straight_preference', value: current.straight_preference },
                { name: 'x_hand_focus', value: current.x_hand_focus },
                { name: 'bonus_aggression', value: current.bonus_aggression },
                { name: 'pure_preference', value: current.pure_preference },
                { name: 'trips_in_hand_focus', value: current.trips_in_hand_focus },
                { name: 'row3_delay_focus', value: current.row3_delay_focus },
                { name: 'showdown_delay_focus', value: current.showdown_delay_focus },
                { name: 'low_card_avoidance', value: current.low_card_avoidance },
                { name: 'turn_order_flexibility', value: current.turn_order_flexibility },
            ];
            
            strategies.sort((a, b) => a.value - b.value);
            const weakest = strategies[0].name;
            const strongest = strategies[strategies.length - 1].name;

            updated[weakest] *= 1.04;      // Boost under-utilized tactics
            updated[strongest] *= 0.985;   // Tone down over-relied extremes
            
            updated.defensive_awareness *= 1.02; // Boost defensive learning slightly on loss
            updated.low_card_avoidance *= 1.02;   // Increase carefulness in placing cards
        }

        // Clip parameters to safe ranges
        updated.trip_preference = Math.min(Math.max(updated.trip_preference, 0.4), 2.0);
        updated.flush_preference = Math.min(Math.max(updated.flush_preference, 0.4), 2.0);
        updated.straight_preference = Math.min(Math.max(updated.straight_preference, 0.4), 2.0);
        updated.x_hand_focus = Math.min(Math.max(updated.x_hand_focus, 0.4), 2.0);
        updated.bonus_aggression = Math.min(Math.max(updated.bonus_aggression, 0.4), 2.5);
        updated.defensive_awareness = Math.min(Math.max(updated.defensive_awareness, 0.4), 1.5);
        
        updated.pure_preference = Math.min(Math.max(updated.pure_preference, 0.3), 2.0);
        updated.trips_in_hand_focus = Math.min(Math.max(updated.trips_in_hand_focus, 0.4), 2.0);
        updated.row3_delay_focus = Math.min(Math.max(updated.row3_delay_focus, 0.4), 2.0);
        updated.showdown_delay_focus = Math.min(Math.max(updated.showdown_delay_focus, 0.4), 2.0);
        updated.low_card_avoidance = Math.min(Math.max(updated.low_card_avoidance, 0.4), 2.0);
        updated.turn_order_flexibility = Math.min(Math.max(updated.turn_order_flexibility, 0.4), 2.0);

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
                pure_preference: updated.pure_preference,
                trips_in_hand_focus: updated.trips_in_hand_focus,
                row3_delay_focus: updated.row3_delay_focus,
                showdown_delay_focus: updated.showdown_delay_focus,
                low_card_avoidance: updated.low_card_avoidance,
                turn_order_flexibility: updated.turn_order_flexibility,
                updated_at: updated.updated_at
            })
            .eq('id', 1);

        if (error) {
            console.error('[Supabase] Error updating global AI parameters:', error);
        } else {
            console.log('[Supabase] Successfully contributed game outcome to the 12-parameter Global AI Learning pool!');
        }
    } catch (e) {
        console.error('[Supabase] Failed to update global AI parameters:', e);
    }
}
