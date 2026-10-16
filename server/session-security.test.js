import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedTokenExpiry, installSessionExpiry, createContactLimiter } from './session-security.js';
const token = payload => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
test('rejects missing/invalid/expired token lifetime after identity verification', () => {
    for (const payload of [{}, { exp: '100' }, { exp: 1 }, { exp: 2 }]) {
        assert.throws(() => verifiedTokenExpiry(token(payload), 2000));
    }
    assert.equal(verifiedTokenExpiry(token({ exp: 3 }), 2000), 3000);
});
test('existing socket cannot act after expiry even if timer is delayed', () => {
    let middleware, timer, disconnected = false, now = 1000;
    const socket = { use(fn) { middleware = fn; }, once() {}, disconnect() { disconnected = true; } };
    installSessionExpiry(socket, 2000, () => now, (fn, delay) => { timer = fn; assert.equal(delay, 1000); return { unref() {} }; });
    let error;
    middleware([], value => { error = value; });
    assert.equal(error, undefined);
    now = 2000;
    middleware([], value => { error = value; });
    assert.match(error.message, /expired/);
    assert.equal(disconnected, true);
    disconnected = false;
    timer();
    assert.equal(disconnected, true);
});

test('contact quota survives reconnects and concurrent requests', () => {
    let now = 0;
    const consume = createContactLimiter(() => now);
    assert.equal(consume('user', 'ip'), true);
    assert.equal(consume('user', 'different-ip'), false);
    for (let i = 0; i < 4; i++) assert.equal(consume(null, 'ip'), true);
    assert.equal(consume(null, 'ip'), false);
    now = 60_000;
    assert.equal(consume('user', 'ip'), true);
});
test('contact global quota bounds anonymous address rotation', () => {
    const consume = createContactLimiter(() => 0);
    for (let i = 0; i < 60; i++) assert.equal(consume(null, `ip${i}`), true);
    assert.equal(consume(null, 'another'), false);
});
