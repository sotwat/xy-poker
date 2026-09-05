import { initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import fontData from '../../../.private/vectura.bin';
import { isValidLettering, renderLettering } from '../../../workers/lettering.js';

// One renderer initialization per isolate; no player or request data is retained.
const ready = initWasm(wasm);

export async function onRequest({ request, params }) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
    const url = new URL(request.url);
    const kind = params.kind;
    const value = url.searchParams.get('value');
    if (!isValidLettering(kind, value)) return new Response('Invalid lettering', { status: 400 });
    try {
        await ready;
        const png = renderLettering(kind, value, new Uint8Array(fontData));
        return new Response(png, { headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'private, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
            'Cross-Origin-Resource-Policy': 'same-origin',
        } });
    } catch {
        console.error('Lettering render failed');
        return new Response('Lettering unavailable', { status: 503 });
    }
}
