import { Resvg } from '@resvg/resvg-wasm';

export function isValidLettering(kind, value) {
    if (typeof value !== 'string') return false;
    if (kind === 'card-rank') return /^(?:[2-9]|10|[JQKA]|JOKER)$/.test(value);
    if (kind === 'rating') return /^-?\d{1,6}$/.test(value);
    return kind === 'text' && /^[\x20-\x7e]{1,32}$/.test(value) && /[a-z0-9]/i.test(value);
}

export function renderLettering(kind, value, fontBuffer) {
    const escaped = value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
    const font = { fontBuffers: [fontBuffer], defaultFontFamily: 'Y1Vectura' };
    const color = kind === 'rating' ? '#fff4a1' : '#fff';
    const text = `<text x="8" y="134" font-family="Y1Vectura" font-size="180" fill="${color}">${escaped}</text>`;
    const fixedRank = kind === 'card-rank' && value !== 'JOKER';
    let viewBox = '0 0 254 143';
    if (!fixedRank) {
        const measure = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="6500" height="200">${text}</svg>`, { font });
        try {
            const box = measure.getBBox();
            if (!box || !box.width) throw new Error('No visible lettering');
            viewBox = `${box.x - 8} ${box.y - 8} ${box.width + 16} ${box.height + 16}`;
            box.free();
        } finally {
            measure.free();
        }
    }
    const renderer = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${text}</svg>`, {
        font, fitTo: { mode: 'width', value: fixedRank ? 254 : 616 },
    });
    let rendered;
    try {
        rendered = renderer.render();
        return rendered.asPng();
    } finally {
        rendered?.free();
        renderer.free();
    }
}
