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
