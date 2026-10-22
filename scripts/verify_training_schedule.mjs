import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [eventPath, resultPath] = process.argv.slice(2);
const result = JSON.parse(readFileSync(resultPath, 'utf8'));
const raw = readFileSync(eventPath).subarray(0, result.snapshot_bytes);
assert.equal(createHash('sha256').update(raw).digest('hex'), result.input_sha256);
const events = raw.toString('utf8').trim().split('\n').map(JSON.parse)
  .filter(e => e.event === 'selfplay');
assert.equal(new Set(events.map(e => e.total_games)).size, events.length);
for (const [group, expected] of Object.entries(result.groups)) {
  const groupEvents = events.filter(e => (e.total_games <= 4772) === (group === 'before_migration'));
  assert.equal(groupEvents.length, expected.episodes);
  const historical = groupEvents.filter(e => e.iteration >= 4 && e.opponent === 'past-model');
  assert.equal(historical.length, expected.past_model_episodes);
  for (const e of historical) {
    const generationGame = e.total_games - 1;
    assert.equal(generationGame % 4, 3);
    assert.equal(e.match.model_seat, 1);
  }
}
const cells = new Map();
for (let generation = 4; generation < 36; generation++) {
  const key = `${generation % 4}:${Math.floor(generation / 4) % 2}`;
  cells.set(key, (cells.get(key) ?? 0) + 1);
}
assert.equal(cells.size, 8);
assert.ok([...cells.values()].every(n => n === 4));
console.log(JSON.stringify({ verified: true, events: events.length, syntheticCells: cells.size }));
