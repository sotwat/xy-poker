import test from 'node:test';
import assert from 'node:assert/strict';
import {
    canUseProThoughtJournal,
    shouldPauseTurnTimerForProThought,
} from './proThought';

test('offers the thought journal only to PRO users in local AI matches', () => {
    const base = {
        isPremium: true,
        mode: 'local' as const,
        phase: 'playing' as const,
    };

    assert.equal(canUseProThoughtJournal(base), true);
    assert.equal(canUseProThoughtJournal({ ...base, isPremium: false }), false);
    assert.equal(canUseProThoughtJournal({ ...base, mode: 'online' }), false);
    assert.equal(canUseProThoughtJournal({ ...base, phase: 'setup' }), false);
});

test('pauses the turn timer only while the editor is open on the PRO player turn', () => {
    const base = {
        isAvailable: true,
        isEditorOpen: true,
        currentPlayerIndex: 0,
        controlledPlayerIndex: 0,
    };

    assert.equal(shouldPauseTurnTimerForProThought(base), true);
    assert.equal(shouldPauseTurnTimerForProThought({ ...base, isAvailable: false }), false);
    assert.equal(shouldPauseTurnTimerForProThought({ ...base, isEditorOpen: false }), false);
    assert.equal(shouldPauseTurnTimerForProThought({ ...base, currentPlayerIndex: 1 }), false);
});
