import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createRandomShowdownVoiceAssignment,
    getShowdownVoiceAssetPath,
    normalizeShowdownVoiceAssignment,
} from './showdownVoice';

function sequence(...values: number[]): () => number {
    let index = 0;
    return () => values[index++] ?? 0;
}

test('assigns exactly two distinct showdown characters to blue and red', () => {
    const assignments = [
        createRandomShowdownVoiceAssignment(sequence(0, 0)),
        createRandomShowdownVoiceAssignment(sequence(0, 0.99)),
        createRandomShowdownVoiceAssignment(sequence(0.34, 0)),
        createRandomShowdownVoiceAssignment(sequence(0.34, 0.99)),
        createRandomShowdownVoiceAssignment(sequence(0.99, 0)),
        createRandomShowdownVoiceAssignment(sequence(0.99, 0.99)),
    ];

    assert.equal(new Set(assignments.map(value => `${value.p1}:${value.p2}`)).size, 6);
    assert.ok(assignments.every(value => value.p1 !== value.p2));
});

test('validates synchronized assignments and maps every hand to an audio asset', () => {
    assert.deepEqual(normalizeShowdownVoiceAssignment({ p1: 'mana', p2: 'kurowa' }), {
        p1: 'mana',
        p2: 'kurowa',
    });
    assert.equal(normalizeShowdownVoiceAssignment({ p1: 'mana', p2: 'mana' }), null);
    assert.equal(normalizeShowdownVoiceAssignment({ p1: 'unknown', p2: 'kurowa' }), null);
    assert.equal(
        getShowdownVoiceAssetPath('tsukuyomi', 'PureStraightFlush'),
        '/showdown-voices/tsukuyomi/pure-straight-flush.m4a',
    );
});
