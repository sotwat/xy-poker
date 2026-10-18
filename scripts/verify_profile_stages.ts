import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import type { Card, GameState } from '../src/logic/types';

type Move = { cardId: string; colIndex: number; isHidden: boolean };
type World = { worldSeed: number; state: GameState; moves: Move[] };
type Row = { deal: number; swap: number; ply: number; worlds: World[] };
type Data = { decisions: number; sourceHashes: Record<string, string>; groups: {
    seed: number; fixtures: { deal: number; deck: Card[]; dice: number[]; moves: Move[] }[];
    rows: Row[]; summary: { ply: number; worlds: number; allSame: number;
        pairDisagreements: { a: number; b: number; count: number }[] }[] }[] };
const data = JSON.parse(readFileSync('gto_profile_stages_20261018.json', 'utf8')) as Data;
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
for (const [p, h] of Object.entries(data.sourceHashes)) assert.equal(hash(readFileSync(p)), h);
const key = (m: Move) => `${m.cardId}/${m.colIndex}/${Number(m.isHidden)}`;
const decks = new Set<string>();
let decisions = 0;
function conserve(s: GameState) {
    const all = [...s.deck, ...s.players.flatMap(p => [...p.hand, ...p.board.flat().filter(c => c)])];
    assert.equal(all.length, 52); assert.equal(new Set(all.map(c => c!.id)).size, 52);
}
function view(s: GameState, observer: number) {
    return { ...s, deck: s.deck.length, players: s.players.map((p, i) => ({ ...p,
        hand: i === observer ? p.hand : p.hand.length,
        board: p.board.map(r => r.map(c => c && i !== observer && c.isHidden ? { isHidden: true } : c)) })) };
}
assert.deepEqual(data.groups.map(g => g.seed), [100518501, 100518502]);
for (const g of data.groups) {
    assert.equal(g.fixtures.length, 4); assert.equal(g.rows.length, 24);
    assert.equal(new Set(g.rows.map(r => `${r.deal}/${r.swap}/${r.ply}`)).size, 24);
    for (const f of g.fixtures) {
        const digest = hash(JSON.stringify(f.deck)); assert.ok(!decks.has(digest)); decks.add(digest);
        let s = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck: f.deck, initialDice: f.dice, startingPlayer: 0 } });
        s = gameReducer(s, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
        assert.equal(f.moves.length, 22);
        for (let i = 0; i < f.moves.length; i++) {
            const next = gameReducer(s, { type: 'PLACE_AND_DRAW', payload: f.moves[i] });
            assert.notEqual(next, s); s = next; conserve(s);
            if (![6, 14, 22].includes(i + 1)) continue;
            for (const swap of [0, 1]) {
                const row = g.rows.find(r => r.deal === f.deal && r.swap === swap && r.ply === i + 1)!;
                assert.ok(row); assert.equal(row.worlds.length, 4);
                const expected = structuredClone(s);
                if (swap) { expected.players = [{ ...s.players[1], id: 'p1' }, { ...s.players[0], id: 'p2' }]; expected.currentPlayerIndex = 1; }
                for (const w of row.worlds) {
                    conserve(w.state);
                    assert.deepEqual(view(w.state, 1 - swap), JSON.parse(JSON.stringify(view(expected, 1 - swap))));
                    assert.equal(w.moves.length, 4);
                    for (const m of w.moves) {
                        const own = w.state.players[swap];
                        assert.ok(own.hand.some(c => c.id === m.cardId)); assert.equal(own.board[2][m.colIndex], null);
                        if (m.isHidden) { assert.ok(own.hiddenCardsCount < 3); assert.ok(own.board.filter(r => r[m.colIndex]?.isHidden).length < 2); }
                        const end = gameReducer(w.state, { type: 'PLACE_AND_DRAW', payload: m });
                        assert.notEqual(end, w.state); conserve(end); decisions++;
                    }
                }
            }
        }
    }
    for (const summary of g.summary) {
        const worlds = g.rows.filter(r => r.ply === summary.ply).flatMap(r => r.worlds);
        assert.equal(summary.worlds, worlds.length);
        assert.equal(summary.allSame, worlds.filter(w => new Set(w.moves.map(key)).size === 1).length);
        assert.equal(summary.pairDisagreements.length, 6);
        for (const p of summary.pairDisagreements) assert.equal(p.count, worlds.filter(w => key(w.moves[p.a]) !== key(w.moves[p.b])).length);
    }
}
assert.equal(decisions, 768); assert.equal(decisions, data.decisions);
console.log(JSON.stringify({ verifiedDecisions: decisions, distinctDeals: decks.size, fixtureReplayMoves: 176, groups: 2, status: 'PASS' }));
