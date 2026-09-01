import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getControlledPlayerIndex,
    shouldProAutoChooseTurn,
    shouldProAutoPlace,
} from './proAuto';

test('maps a local player or online host to player one and an online guest to player two', () => {
    assert.equal(getControlledPlayerIndex(false, null), 0);
    assert.equal(getControlledPlayerIndex(true, 'host'), 0);
    assert.equal(getControlledPlayerIndex(true, 'guest'), 1);
});

test('allows placement only for an enabled PRO on their playable turn', () => {
    const base = {
        isPremium: true,
        isAutoPlay: true,
        phase: 'playing' as const,
        currentPlayerIndex: 1,
        controlledPlayerIndex: 1,
        showDiceAnimation: false,
        isTurnAnnouncementVisible: false,
    };

    assert.equal(shouldProAutoPlace(base), true);
    assert.equal(shouldProAutoPlace({ ...base, isPremium: false }), false);
    assert.equal(shouldProAutoPlace({ ...base, isAutoPlay: false }), false);
    assert.equal(shouldProAutoPlace({ ...base, currentPlayerIndex: 0 }), false);
    assert.equal(shouldProAutoPlace({ ...base, showDiceAnimation: true }), false);
    assert.equal(shouldProAutoPlace({ ...base, isTurnAnnouncementVisible: true }), false);
});

test('lets AUTO choose turn order only after a PRO wins and the toss animation finishes', () => {
    const base = {
        isPremium: true,
        isAutoPlay: true,
        phase: 'turn_selection' as const,
        chooserIndex: 1,
        controlledPlayerIndex: 1,
        showDiceAnimation: false,
        isTossingCoin: false,
    };

    assert.equal(shouldProAutoChooseTurn(base), true);
    assert.equal(shouldProAutoChooseTurn({ ...base, chooserIndex: 0 }), false);
    assert.equal(shouldProAutoChooseTurn({ ...base, chooserIndex: null }), false);
    assert.equal(shouldProAutoChooseTurn({ ...base, isTossingCoin: true }), false);
    assert.equal(shouldProAutoChooseTurn({ ...base, isPremium: false }), false);
});
