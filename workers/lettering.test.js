import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { initWasm } from '@resvg/resvg-wasm';
import { isValidLettering, renderLettering } from './lettering.js';

test('lettering accepts game ranks, ratings, and bounded English names', () => {
    for (const rank of ['2', '9', '10', 'J', 'Q', 'K', 'A']) assert.equal(isValidLettering('card-rank', rank), true);
    assert.equal(isValidLettering('rating', '1500'), true);
    assert.equal(isValidLettering('rating', '-12'), true);
    assert.equal(isValidLettering('text', '-Raven'), true);
    assert.equal(isValidLettering('text', "A & B's <team>"), true);
});

test('lettering rejects unsupported layouts, invalid numbers, and oversized input', () => {
    for (const rank of ['1', '11', '<svg>', '', null]) assert.equal(isValidLettering('card-rank', rank), false);
    for (const rating of ['1.2', 'Infinity', '1000000', '']) assert.equal(isValidLettering('rating', rating), false);
    assert.equal(isValidLettering('text', 'x'.repeat(33)), false);
    assert.equal(isValidLettering('text', '日本語'), false);
    assert.equal(isValidLettering('text', '\n'), false);
    assert.equal(isValidLettering('font', 'data'), false);
});

test('private font renderer returns PNGs with a shared card-rank canvas', { skip: !existsSync('.private/vectura.bin') }, async () => {
    await initWasm(readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)));
    const font = readFileSync('.private/vectura.bin');
    for (const rank of ['A', 'K', 'Q', 'J', '10', '2']) {
        const png = Buffer.from(renderLettering('card-rank', rank, font));
        assert.equal(png.subarray(1, 4).toString(), 'PNG');
        assert.equal(png.readUInt32BE(16), 254);
        assert.equal(png.readUInt32BE(20), 143);
    }
    for (const [kind, value] of [['text', "A & B's <team>"], ['rating', '1500']]) {
        const png = Buffer.from(renderLettering(kind, value, font));
        assert.equal(png.subarray(1, 4).toString(), 'PNG');
        assert.equal(png.readUInt32BE(16), 616);
        assert.ok(png.readUInt32BE(20) > 0);
    }
});
