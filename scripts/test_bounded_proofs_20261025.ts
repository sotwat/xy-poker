import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { solveFinalMove } from '../src/logic/endgame';
import { findForcedWinPlan, continueForcedWinPlan } from '../src/logic/forcedWin';
import type { GameState } from '../src/logic/types';

const root = resolve('.selfplay/bounded-proofs-20261025');
const generated = (name: string) => import(pathToFileURL(`${root}/${name}.ts`).href);
const budget = await generated('budget');
const endgame = await generated('endgame');
const forced = await generated('forcedWin');
const rows: unknown[] = [];
for (const fixture of ['endgame', 'endgame-reply', 'response-bounds', 'forced-win', 'joint-forced-win', 'shared-four-proof']) {
    const state = JSON.parse(readFileSync(`src/logic/fixtures/${fixture}.json`, 'utf8')).state as GameState;
    const before = JSON.stringify(state), actor = state.currentPlayerIndex as 0 | 1;
    const final = fixture.startsWith('endgame') || fixture === 'response-bounds';
    const invoke = () => final ? endgame.solveFinalMove(state, actor, Infinity, true) : forced.findForcedWinPlan(state, actor, Infinity);
    const cpu = process.cpuUsage(), started = process.hrtime.bigint();
    const full = budget.boundedProof(20_000_000, invoke);
    assert.equal(full.status, 'returned', `${fixture} full budget`);
    assert.ok(full.result, `${fixture} returns a completed analysis/certificate`);
    const original = final ? solveFinalMove(state, actor, Infinity, true) : findForcedWinPlan(state, actor, Infinity);
    assert.deepEqual(full.result, original);
    assert.equal(JSON.stringify(state), before);
    const exact = budget.boundedProof(full.used, invoke);
    assert.deepEqual(exact, { ...full, remaining: 0 });
    for (const limit of [0, 1, Math.floor(full.used / 2), full.used - 1]) {
        const partial = budget.boundedProof(limit, invoke);
        assert.equal(partial.status, 'incomplete');
        assert.equal(partial.result, null);
        assert.equal(partial.used, limit);
        assert.equal(partial.remaining, 0);
        assert.ok(partial.exhaustedAt);
        assert.equal(JSON.stringify(state), before);
    }
    const repeat = budget.boundedProof(20_000_000, invoke);
    assert.deepEqual(repeat, full);
    if (!final) assert.deepEqual(continueForcedWinPlan(state, full.result), full.result.moves[0]);
    const consumed = process.cpuUsage(cpu);
    rows.push({ fixture, work: full.used, proofMethod: full.result.boundMethod ?? 'final-enumeration',
        worlds: full.result.worlds ?? null, cpuMs: (consumed.user + consumed.system) / 1000,
        elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
        checks: ['original-parity', 'exact-boundary', 'zero-one-half-minus-one-incomplete', 'repeat', 'input-preserved'] });
}
assert.throws(() => budget.boundedProof(-1, () => null), /Invalid work limit/);
assert.throws(() => budget.boundedProof(1.5, () => null), /Invalid work limit/);
assert.throws(() => budget.boundedProof(1, () => { throw new Error('not exhaustion'); }), /not exhaustion/);
writeFileSync('gto_bounded_proofs_20261025.json', JSON.stringify({ complete: true,
    scope: 'Diagnostic proof harness only; not A9 integration, full-game bound, or strength evaluation',
    manifest: JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8')), rows }, null, 2) + '\n');
console.log(JSON.stringify(rows));
