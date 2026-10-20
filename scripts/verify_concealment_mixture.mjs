import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const out = read('gto_concealment_mixture_20261021.json');
const units = s => { const [n, d = 1] = s.split('/').map(Number); assert.ok((12 * n) % d === 0); return 12 * n / d; };
for (const [path, hash] of Object.entries(out.sourceHashes)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash);
let total = 0;
assert.equal(out.groups.length, 4);
for (const g of out.groups) {
    const input = read(g.source).groups.find(x => x.phase === g.phase);
    assert.equal(g.seed, input.seed);
    assert.deepEqual(g.worlds.map(w => `${w.rowIndex}/${w.worldIndex}`), [...new Set(input.cases.map(c => `${c.rowIndex}/${c.worldIndex}`))]);
    let gains = 0, sum = 0, max = 0;
    for (const w of g.worlds) {
        const cases = input.cases.filter(c => c.rowIndex === w.rowIndex && c.worldIndex === w.worldIndex).sort((a,b) => a.profile - b.profile);
        assert.deepEqual(cases.map(c => c.profile), [0, 1, 2, 3]);
        assert.deepEqual([w.deal, w.swap, w.ply], [cases[0].deal, cases[0].swap, cases[0].ply]);
        const matrix = [0, 1].map(arm => cases.map(c => c.arms[arm].winner === 'draw' ? 0 : c.arms[arm].winner === `p${c.root+1}` ? 1 : -1));
        assert.deepEqual(w.matrix, matrix);
        assert.ok(matrix.flat().every(x => [-1, 0, 1].includes(x)));
        // Slopes are integers in [-2,2], so every intersection in [0,1] has denominator <=4 and lies on the 1/12 grid.
        const values = Array.from({length:13}, (_, k) => Math.min(...matrix[0].map((x,j) => (12-k)*x+k*matrix[1][j])));
        const best = Math.max(...values), first = values.indexOf(best), pure = Math.max(values[0], values[12]);
        assert.equal(units(w.hideProbability), first); assert.equal(units(w.mixedValue), best);
        assert.equal(units(w.pureValue), pure); assert.equal(units(w.gain), best-pure);
        gains += Number(best > pure); sum += best-pure; max = Math.max(max, best-pure); total++;
    }
    assert.equal(g.summary.worlds, g.worlds.length); assert.equal(g.summary.strictGains, gains);
    assert.equal(units(g.summary.sumGain), sum); assert.equal(units(g.summary.maxGain), max);
}
console.log(JSON.stringify({exactIntegerGridVerified:total, startedUtc:out.startedUtc, endedUtc:out.endedUtc}));
