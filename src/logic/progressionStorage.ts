import { supabase } from '../supabase';
import { unlockedCosmetics } from './progression';
export interface ProgressionInventory {
    level: number; achievements: string[]; titles: string[]; selectedTitle: string | null;
    skins: { kind: string; skin_id: string }[];
}
export async function loadProgression(userId?: string): Promise<ProgressionInventory> {
    if (userId) {
        const { data, error } = await supabase.rpc('sync_progression');
        if (error) throw error;
        return data as ProgressionInventory;
    }
    let stored;
    try { stored = JSON.parse(localStorage.getItem('xypoker_guest_progress') || '{}') ?? {}; } catch { stored = {}; }
    const level = stored.level ?? 1;
    const achievements: string[] = stored.achievements ?? [];
    const unlocked = unlockedCosmetics(level, achievements);
    return { level, achievements, titles: unlocked.filter(c => c.kind === 'title').map(c => c.id),
        selectedTitle: unlocked.some(c => c.kind === 'title' && c.id === localStorage.getItem('xypoker_guest_title')) ? localStorage.getItem('xypoker_guest_title') : null,
        skins: unlocked.filter(c => c.kind !== 'title').map(c => ({ kind: c.kind, skin_id: c.id })) };
}
export async function equipTitle(title: string | null, userId?: string) {
    if (userId) {
        const { error } = await supabase.rpc('equip_title', { p_title: title });
        if (error) throw error;
    } else {
        const inventory = await loadProgression();
        if (title && !inventory.titles.includes(title)) throw new Error('Title locked');
        if (title) localStorage.setItem('xypoker_guest_title', title);
        else localStorage.removeItem('xypoker_guest_title');
    }
    window.dispatchEvent(new CustomEvent('xypoker-title', { detail: title }));
}
