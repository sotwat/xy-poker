import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const result = read('gto_concealment_profile_safety_20261020.json');
for (const [path, hash] of Object.entries(result.sourceHashes)) {
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash);
}
assert.equal(result.groups.length, 4);
let verified = 0;
for (const group of result.groups) {
    const original = read(group.source).groups.find(g => g.phase === group.phase);
    assert.equal(original.seed, group.seed);
    const expectedKeys = [...new Set(original.cases.map(c => `${c.rowIndex}/${c.worldIndex}`))];
    assert.deepEqual(group.worlds.map(w => `${w.rowIndex}/${w.worldIndex}`), expectedKeys);
    const counts = { equal: 0, hideNonworse: 0, publicNonworse: 0, conflict: 0 };
    let positiveMeanWithLoss = 0;
    for (const w of group.worlds) {
        const cases = original.cases.filter(c => c.rowIndex === w.rowIndex && c.worldIndex === w.worldIndex).sort((a, b) => a.profile - b.profile);
        assert.deepEqual(cases.map(c => c.profile), [0, 1, 2, 3]);
        assert.deepEqual([w.deal, w.swap, w.ply], [cases[0].deal, cases[0].swap, cases[0].ply]);
        const deltas = cases.map(c => {
            const utility = arm => arm.winner === 'draw' ? 0 : arm.winner === `p${c.root + 1}` ? 1 : -1;
            return utility(c.arms[1]) - utility(c.arms[0]);
        });
        assert.deepEqual(w.deltas, deltas);
        const positive = deltas.some(d => d > 0), negative = deltas.some(d => d < 0);
        const label = positive && negative ? 'conflict' : positive ? 'hideNonworse' : negative ? 'publicNonworse' : 'equal';
        assert.equal(w.classification, label); counts[label]++;
        const meanLoss = negative && deltas.reduce((a, b) => a + b, 0) > 0;
        assert.equal(w.positiveMeanWithLoss, meanLoss); positiveMeanWithLoss += Number(meanLoss); verified++;
    }
    assert.deepEqual(group.summary, { worlds: group.worlds.length, classes: counts, positiveMeanWithLoss });
}
console.log(JSON.stringify({ verifiedWorldGroups: verified, scalarOutcomeComparisons: verified * 4, startedUtc: result.startedUtc, endedUtc: result.endedUtc }));
