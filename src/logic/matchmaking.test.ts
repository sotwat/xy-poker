import test from 'node:test';
import assert from 'node:assert/strict';
import {
    QUICK_MATCH_BOT_FALLBACK_MS,
    QUICK_MATCH_BOT_FALLBACK_SECONDS,
} from './matchmaking';

test('falls back to a bot after thirty seconds', () => {
    assert.equal(QUICK_MATCH_BOT_FALLBACK_MS, 30_000);
    assert.equal(QUICK_MATCH_BOT_FALLBACK_SECONDS, 30);
});
