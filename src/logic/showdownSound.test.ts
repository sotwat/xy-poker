import assert from 'node:assert/strict';
import test from 'node:test';
import { getShowdownSoundTimeline, getShowdownWinnerChord } from './showdownSound';

test('synchronizes every card entry and impact with the visual stagger', () => {
    const timeline = getShowdownSoundTimeline(3, false);

    assert.deepEqual(timeline.cardEntries, [0.15, 0.26, 0.37]);
    assert.deepEqual(timeline.cardImpacts, [0.555, 0.665, 0.775]);
    assert.ok(timeline.titleImpact >= timeline.cardImpacts.at(-1)!);
    assert.ok(timeline.voiceStart > timeline.titleImpact);
});

test('supports five-card X hands and clamps malformed card counts', () => {
    const finalTimeline = getShowdownSoundTimeline(99, true);
    const emptyTimeline = getShowdownSoundTimeline(-4, false);

    assert.equal(finalTimeline.cardEntries.length, 5);
    assert.equal(finalTimeline.cardImpacts.length, 5);
    assert.equal(finalTimeline.cardImpacts.at(-1), 0.995);
    assert.ok(finalTimeline.voiceStart > finalTimeline.cardImpacts.at(-1)!);
    assert.deepEqual(emptyTimeline.cardEntries, []);
});

test('gives blue, red, and draw outcomes distinct confirmation chords', () => {
    const blue = getShowdownWinnerChord('p1');
    const red = getShowdownWinnerChord('p2');
    const draw = getShowdownWinnerChord('draw');

    assert.notDeepEqual(blue, red);
    assert.notDeepEqual(red, draw);
    assert.notDeepEqual(draw, blue);
});
