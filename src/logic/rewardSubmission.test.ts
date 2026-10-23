import test from 'node:test';
import assert from 'node:assert/strict';
import { submitRewardRecord } from './rewardSubmission';
import type { MatchRewards } from './matchRewards';

test('early submission waits for the server guard, then publishes one receipt', context => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const receipt = { matchId: 'match' } as MatchRewards;
    let sends = 0, saved = 0, errors = 0;
    submitRewardRecord(done => {
        sends++;
        done(null, sends === 1 ? { retryAfterMs: 12_000 } : { success: true, rewards: receipt });
    }, () => true, value => { assert.equal(value, receipt); saved++; }, () => errors++);
    assert.equal(sends, 1);
    context.mock.timers.tick(12_099);
    assert.equal(sends, 1);
    context.mock.timers.tick(1);
    assert.deepEqual([sends, saved, errors], [2, 1, 0]);
});

test('leaving or starting a different match cancels delayed updates', context => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    let current = true, sends = 0;
    const cancel = submitRewardRecord(done => { sends++; done(null, { retryAfterMs: 1000 }); }, () => current,
        () => assert.fail('stale receipt'), () => assert.fail('stale error'));
    current = false;
    context.mock.timers.tick(1200);
    assert.equal(sends, 1);
    cancel();
});

test('invalid waits and repeated refusal fail visibly instead of retrying forever', context => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    for (const wait of [-1, Infinity, 30_001, undefined]) {
        let errors = 0;
        submitRewardRecord(done => done(null, { retryAfterMs: wait }), () => true, () => assert.fail(), () => errors++);
        assert.equal(errors, 1);
    }
    let sends = 0, errors = 0;
    submitRewardRecord(done => { sends++; done(null, { retryAfterMs: 100 }); }, () => true, () => assert.fail(), () => errors++);
    context.mock.timers.tick(200);
    assert.deepEqual([sends, errors], [2, 1]);
});
