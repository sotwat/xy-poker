import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { scoreGtoMove, getGtoHideProbability, XY_GTO_A7, XY_GTO_A6, XY_GTO_A4, XY_GTO_A3 } from '../src/logic/gtoPolicy';
import type { Card, GameState } from '../src/logic/types';

type Input = { sourceHashes: Record<string, string>; groups: { phase: string; seed: number;
    rows: { deal: number; swap: number; ply: number; worlds: { state: GameState }[] }[] }[] };
const source = 'gto_profile_stages_20261018.json';
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const data = JSON.parse(readFileSync(source, 'utf8')) as Input;
for (const [p, h] of Object.entries(data.sourceHashes)) assert.equal(sha(p), h);
const startedUtc = new Date().toISOString(), deadline = Date.now() + 60000;
const profiles = [XY_GTO_A7, XY_GTO_A6, XY_GTO_A4, XY_GTO_A3];
function unknown(s: GameState) {
    const opp = s.players[1 - s.currentPlayerIndex];
    return [...opp.board.flat().filter((c): c is Card => c !== null && !!c.isHidden), ...opp.hand, ...s.deck];
}
function rotate(s: GameState, shift: number) {
    const copy = structuredClone(s), pool = unknown(s), opp = copy.players[1 - copy.currentPlayerIndex];
    let cursor = shift;
    const take = (hidden: boolean) => ({ ...pool[cursor++ % pool.length], isHidden: hidden });
    opp.board = opp.board.map(row => row.map(c => c?.isHidden ? take(true) : c));
    opp.hand = opp.hand.map(() => take(false)); copy.deck = copy.deck.map(() => take(false));
    assert.equal(cursor, shift + pool.length);
    return copy;
}
function view(s: GameState) {
    return JSON.stringify({ ...s, deck: s.deck.length, players: s.players.map((p, i) => ({ ...p,
        hand: i === s.currentPlayerIndex ? p.hand : p.hand.length,
        board: p.board.map(r => r.map(c => c && c.isHidden && i !== s.currentPlayerIndex ? { isHidden: true } : c)) })) });
}
function ownership(s: GameState) {
    const ids = [...s.deck, ...s.players.flatMap(p => [...p.hand, ...p.board.flat().filter(c => c !== null)])].map(c => c.id).sort();
    assert.equal(ids.length, 52); assert.equal(new Set(ids).size, 52); return ids;
}
function values(s: GameState) {
    const actor = s.currentPlayerIndex;
    assert.ok(actor === 0 || actor === 1);
    const p = s.players[actor];
    return profiles.flatMap(weights => p.hand.flatMap(card => p.board[2].flatMap((cell, col) => cell ? [] : [{
        score: scoreGtoMove(s, actor, card, col, weights),
        hide: getGtoHideProbability(s, actor, card, col, weights),
    }])));
}
const groups = data.groups.map(g => {
    const rows = g.rows.flatMap(row => row.worlds.map(({ state }, world) => {
        const before = values(state), known = view(state), ids = ownership(state);
        const tests = [1, 2, 3, 4].map(shift => {
            assert.ok(Date.now() < deadline);
            const changed = rotate(state, shift);
            assert.equal(view(changed), known); assert.deepEqual(ownership(changed), ids);
            const positiveControl = unknown(changed)[0].id !== unknown(state)[0].id;
            assert.ok(positiveControl);
            const after = values(changed); assert.equal(before.length, after.length);
            return { shift, positiveControl, compared: before.length,
                changedScores: before.filter((v, i) => v.score !== after[i].score).length,
                changedHide: before.filter((v, i) => v.hide !== after[i].hide).length };
        });
        return { deal: row.deal, swap: row.swap, ply: row.ply, world, tests };
    }));
    const tests = rows.flatMap(r => r.tests);
    return { phase: g.phase, seed: g.seed, rows, mutations: tests.length,
        compared: tests.reduce((s, t) => s + t.compared, 0),
        changedScores: tests.reduce((s, t) => s + t.changedScores, 0), changedHide: tests.reduce((s, t) => s + t.changedHide, 0) };
});
writeFileSync('gto_policy_information_20261019.json', JSON.stringify({ kind: 'local-information-invariance-not-strength',
    source, sourceSha256: sha(source), scriptSha256: sha('scripts/audit_policy_information.ts'),
    startedUtc, endedUtc: new Date().toISOString(), groups }, null, 2), { flag: 'wx' });
console.log(JSON.stringify(groups.map(({ rows, ...rest }) => ({ ...rest, worlds: rows.length }))));
assert.ok(groups.every(g => g.changedScores === 0 && g.changedHide === 0));
