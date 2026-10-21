import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const inputPath = 'gto_constrained_mixture_worlds_20261021.json';
const inputBytes = readFileSync(inputPath);
const data = JSON.parse(inputBytes);
const output = JSON.parse(readFileSync('gto_win_preservation_20261022.json', 'utf8'));
const previous = JSON.parse(readFileSync('gto_constrained_mixture_solution_20261021.json', 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(inputBytes), previous.sourceHashes[inputPath]);
for (const [path, expected] of Object.entries(output.sourceHashes)) {
  assert.equal(sha(readFileSync(path)), expected);
}

function certify(payoffs, baseline, count) {
  const witnesses = Array.from({ length: count }, (_, action) => {
    const index = payoffs.findIndex((entry) => entry.values[baseline] === 1 && entry.values[action] !== 1);
    if (index === -1) return null;
    const { world, profile, values } = payoffs[index];
    return { world, profile, candidateWin: values[action] };
  });
  const allowed = witnesses.flatMap((witness, action) => witness === null ? [action] : []);
  return { allowed, witnesses, baselineOnly: allowed.length === 1 && allowed[0] === baseline };
}

assert.deepEqual(certify([
  { world: 0, profile: 0, values: [1, 0, 1] },
  { world: 1, profile: 0, values: [1, 1, -1] },
], 0, 3).allowed, [0]);
assert.deepEqual(certify([{ world: 0, profile: 0, values: [0, -1] }], 0, 2).allowed, [0, 1]);
const drawRows = [[0, 1, -1], [0, -1, 1]];
assert(drawRows.every((row) => (row[1] + row[2]) / 2 === row[0]));

let outcomes = 0;
const expectedRows = [];
for (const group of data.groups) {
  for (const [ri, row] of group.rows.entries()) {
    const rootId = row.state.players[row.root].id;
    assert.equal(row.actions.length, 4);
    const batches = row.batches.map((batch) => {
      assert.equal(batch.worlds.length, 16);
      return batch.worlds.flatMap((world, wi) => world.arms.map((arms, profile) => ({
        world: wi, profile,
        values: arms.map((arm) => {
          assert(['p1', 'p2', 'draw'].includes(arm.winner));
          const value = arm.winner === 'draw' ? 0 : arm.winner === rootId ? 1 : -1;
          assert.equal(value, arm.win);
          outcomes++;
          return value;
        }),
      })));
    });
    const fit = certify(batches[0], row.baseline, 4);
    const heldout = certify(batches[1], row.baseline, 4);
    const combined = certify([...batches[0], ...batches[1].map((r) => ({ ...r, world: r.world + 16 }))], row.baseline, 4);
    expectedRows.push({
      phase: group.phase, row: ri, deal: row.deal, swap: row.swap, baseline: row.baseline,
      fit, heldout, combined,
      fitAllowedBlockedInHeldout: fit.allowed.filter((action) => !heldout.allowed.includes(action)),
    });
  }
}
assert.deepEqual(output.rows, expectedRows);
for (const row of expectedRows.filter((r) => r.swap === 0)) {
  const other = expectedRows.find((r) => r.phase === row.phase && r.deal === row.deal && r.swap === 1);
  assert(other);
  for (const field of ['baseline', 'fit', 'heldout', 'combined', 'fitAllowedBlockedInHeldout']) {
    assert.deepEqual(row[field], other[field]);
  }
}
const summary = ['selection', 'confirmation'].map((phase) => {
  const rows = expectedRows.filter((r) => r.phase === phase && r.swap === 0);
  return {
    phase, deals: rows.length,
    fitBaselineOnly: rows.filter((r) => r.fit.baselineOnly).length,
    heldoutBaselineOnly: rows.filter((r) => r.heldout.baselineOnly).length,
    combinedBaselineOnly: rows.filter((r) => r.combined.baselineOnly).length,
    fitSurvivorsBlocked: rows.reduce((total, r) => total + r.fitAllowedBlockedInHeldout.length, 0),
  };
});
assert.deepEqual(output.summary, summary);
assert.equal(output.newGames, 0);
assert.equal(output.actualA9Games, 0);
assert.equal(expectedRows.length, 16);
assert.equal(outcomes, 8192);
assert(Date.parse(output.endedUtc) < Date.parse(output.deadlineUtc));
console.log(JSON.stringify({ verifiedRows: expectedRows.length, winnerChecks: outcomes, seatPairs: 8, summary }));
