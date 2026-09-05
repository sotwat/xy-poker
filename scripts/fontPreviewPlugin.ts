import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { loadEnv, type Plugin } from 'vite';

const execute = promisify(execFile);
const variants = new Set(['marker', 'revforge', 'battle', 'gaen', 'nanoline', 'vectura', 'yomiyasu', 'bunan', 'macaronium', 'fullmoon', 'pixelation']);

export function fontPreviewPlugin(): Plugin {
    return {
        name: 'local-font-lettering-preview',
        apply: 'serve',
        configureServer(server) {
            const env = loadEnv(server.config.mode, server.config.root, 'XYPOKER_');
            const cache = new Map<string, Promise<Buffer>>();
            server.middlewares.use('/__font-preview', async (request, response, next) => {
                const url = new URL(request.url || '/', 'http://localhost');
                if (!['/rating', '/text', '/card-rank'].includes(url.pathname)) {
                    next();
                    return;
                }
                const params = url.searchParams;
                const variant = params.get('variant') || 'vectura';
                const value = params.get('value') || '';
                const isRating = url.pathname === '/rating';
                const isCardRank = url.pathname === '/card-rank';
                const validValue = isRating ? /^-?\d{1,6}$/.test(value)
                    : isCardRank ? /^(?:[2-9]|10|[JQKA]|JOKER)$/.test(value)
                    : /^[\x20-\x7e]{1,64}$/.test(value) && /[A-Za-z0-9]/.test(value);
                if (request.method !== 'GET' || !variants.has(variant) || !validValue) {
                    response.statusCode = 400;
                    response.end();
                    return;
                }
                if (!env.XYPOKER_FONT_PACK || !env.XYPOKER_FONT_PYTHON) {
                    response.statusCode = 503;
                    response.end();
                    return;
                }
                const key = `${variant}:${url.pathname}:${value}`;
                try {
                    if (!cache.has(key)) {
                        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
                        cache.set(key, execute(env.XYPOKER_FONT_PYTHON, [
                            resolve(server.config.root, 'scripts/render_home_lettering.py'),
                            env.XYPOKER_FONT_PACK, '--variant', variant, `${isRating ? '--rating' : isCardRank ? '--card-rank' : '--text'}=${value}`,
                        ], { encoding: 'buffer', maxBuffer: 512_000 }).then(result => result.stdout));
                    }
                    const png = await cache.get(key)!;
                    response.setHeader('Content-Type', 'image/png');
                    response.setHeader('Cache-Control', 'private, max-age=3600');
                    response.end(png);
                } catch {
                    cache.delete(key);
                    response.statusCode = 500;
                    response.end();
                }
            });
        },
    };
}
