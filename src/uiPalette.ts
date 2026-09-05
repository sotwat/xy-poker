const palettes = ['ink', 'paper', 'clay', 'slate'];
const requestedPalette = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('palette') : null;

export const uiPalette = requestedPalette === 'current' ? undefined
    : requestedPalette && palettes.includes(requestedPalette) ? requestedPalette : 'ink';

if (import.meta.env.DEV && uiPalette && uiPalette !== 'ink') void import('./previews/Palette.css');
