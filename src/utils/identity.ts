// Utility to get or create a persistent Browser ID
import { v4 as uuidv4 } from 'uuid';

export const getBrowserId = (): string => {
    const STORAGE_KEY = 'xy_poker_browser_id';

    // Check local storage
    let id: string | null = localStorage.getItem(STORAGE_KEY);

    // Check if valid UUID (simple check)
    if (!id || id.length < 10) {
        const newId = uuidv4();
        localStorage.setItem(STORAGE_KEY, newId);
        return newId;
    }

    return id;
};
