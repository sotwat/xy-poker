import logo from './assets/lettering/vectura-logo.png';
import wordmark from './assets/lettering/vectura-wordmark.png';
import ai from './assets/lettering/vectura-ai.png';
import online from './assets/lettering/vectura-online.png';
import skins from './assets/lettering/vectura-skins.png';
import rules from './assets/lettering/vectura-rules.png';
import account from './assets/lettering/vectura-account.png';
import contact from './assets/lettering/vectura-contact.png';
import ratinglabel from './assets/lettering/vectura-rating-label.png';

const variants = ['marker', 'revforge', 'battle', 'gaen', 'nanoline', 'vectura', 'yomiyasu', 'bunan', 'macaronium', 'fullmoon', 'pixelation'] as const;
const requested = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('lettering') : null;

export const homeLetteringVariant = requested && variants.some(variant => variant === requested) ? requested : 'vectura';

const selectedAssets = { logo, wordmark, ai, online, skins, rules, account, contact, 'rating-label': ratinglabel };

function asset(name: keyof typeof selectedAssets) {
    if (import.meta.env.DEV) return `/src/assets/lettering/${homeLetteringVariant}-${name}.png`;
    return selectedAssets[name];
}

export const homeLettering = {
    logo: asset('logo'),
    wordmark: asset('wordmark'),
    ai: asset('ai'),
    online: asset('online'),
    skins: asset('skins'),
    rules: asset('rules'),
    account: asset('account'),
    contact: asset('contact'),
    ratingLabel: asset('rating-label'),
};

export function letteringSource(layout: 'text' | 'card-rank' | 'rating', value: string) {
    const base = import.meta.env.DEV ? '/__font-preview' : '/api/lettering';
    return `${base}/${layout}?variant=${homeLetteringVariant}&value=${encodeURIComponent(value)}`;
}
