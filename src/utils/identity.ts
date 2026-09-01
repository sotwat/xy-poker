const STORAGE_KEY = 'xy_poker_browser_id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let fallbackBrowserId: string | null = null;

export const getBrowserId = (): string => {
    try {
        const storedId = localStorage.getItem(STORAGE_KEY);
        if (storedId && UUID_PATTERN.test(storedId)) return storedId;

        const newId = crypto.randomUUID();
        localStorage.setItem(STORAGE_KEY, newId);
        return newId;
    } catch {
        fallbackBrowserId ??= crypto.randomUUID();
        return fallbackBrowserId;
    }
};
