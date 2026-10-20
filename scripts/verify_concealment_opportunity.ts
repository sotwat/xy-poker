import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gameReducer } from '../src/logic/game';
import type { GameState } from '../src/logic/types';

type Move = { cardId: string; colIndex: number; isHidden: boolean };
type Arm = { moves: Move[]; winner: GameState['winner']; scores: number[]; win: number; margin: number };
type Case = { rowIndex: number; worldIndex: number; deal: number; swap: number; ply: number; profile: number; root: number; arms: Arm[]; firstResponseChanged: boolean; deltaWin: number; deltaMargin: number };
type Summary = { ply: number; pairs: number; firstResponseChanged: number; improved: number; worsened: number; unchanged: number; sumDeltaWin: number; sumDeltaMargin: number };
const input: { groups: { phase: string; seed: number; rows: { deal: number; swap: number; ply: number; worlds: { state: GameState; moves: Move[] }[] }[] }[] } = JSON.parse(readFileSync('gto_profile_stages_20261018.json', 'utf8'));
const output: { startedUtc: string; endedUtc: string; actualA9Games: number; sourceHashes: Record<string, string>; groups: { phase: string; seed: number; excluded: { rowIndex: number; worldIndex: number }[]; cases: Case[]; summary: Summary[] }[] } = JSON.parse(readFileSync('gto_concealment_opportunity_20261020.json', 'utf8'));
for (const [path, hash] of Object.entries(output.sourceHashes)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash);
assert.equal(output.actualA9Games, 0);
assert.equal(output.groups.length, 2);
let replays = 0, placements = 0;
function conserved(s: GameState) {
    const cards = [...s.deck, ...s.players.flatMap(p => [...p.hand, ...p.board.flat().filter(c => c !== null)])];
    assert.equal(cards.length, 52); assert.equal(new Set(cards.map(c => c.id)).size, 52);
}
for (const [gi, group] of output.groups.entries()) {
    const source = input.groups[gi];
    assert.equal(group.phase, source.phase); assert.equal(group.seed, source.seed);
    const expectedExcluded = [], expectedKeys = [];
    for (const [ri, row] of source.rows.entries()) for (const [wi, world] of row.worlds.entries()) {
        const p = world.state.players[world.state.currentPlayerIndex], col = world.moves[0].colIndex;
        if (p.hiddenCardsCount >= 3 || p.board.filter(r => r[col]?.isHidden).length >= 2) expectedExcluded.push({ rowIndex: ri, worldIndex: wi });
        else for (let profile = 0; profile < 4; profile++) expectedKeys.push(`${ri}/${wi}/${profile}`);
    }
    assert.deepEqual(group.excluded, expectedExcluded);
    assert.deepEqual(group.cases.map(c => `${c.rowIndex}/${c.worldIndex}/${c.profile}`), expectedKeys);
    for (const c of group.cases) {
        const row = source.rows[c.rowIndex], world = row.worlds[c.worldIndex];
        assert.deepEqual([c.deal, c.swap, c.ply, c.root], [row.deal, row.swap, row.ply, world.state.currentPlayerIndex]);
        assert.equal(c.arms.length, 2);
        const afterFirst: GameState[] = [];
        for (const [index, arm] of c.arms.entries()) {
            assert.deepEqual(arm.moves[0], { ...world.moves[0], isHidden: Boolean(index) });
            assert.equal(arm.moves.length, 30 - row.ply);
            let state = structuredClone(world.state); conserved(state);
            for (const [mi, move] of arm.moves.entries()) {
                assert.equal(state.phase, 'playing');
                if (mi > 0 && state.currentPlayerIndex === c.root) assert.equal(move.isHidden, false);
                const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
                assert.notEqual(next, state); state = next; conserved(state); placements++;
                for (const player of state.players) {
                    assert.equal(player.hiddenCardsCount, player.board.flat().filter(c => c?.isHidden).length);
                    assert.ok(player.hiddenCardsCount <= 3);
                    for (let col = 0; col < 5; col++) assert.ok(player.board.filter(r => r[col]?.isHidden).length <= 2);
                }
                if (mi === 0) afterFirst.push(state);
            }
            assert.equal(state.phase, 'scoring');
            state = gameReducer(state, { type: 'CALCULATE_SCORE' });
            assert.equal(state.phase, 'ended');
            assert.equal(arm.winner, state.winner); assert.deepEqual(arm.scores, state.players.map(p => p.score));
            assert.equal(arm.margin, arm.scores[c.root] - arm.scores[1 - c.root]);
            assert.equal(arm.win, state.winner === `p${c.root + 1}` ? 1 : state.winner === 'draw' ? 0 : -1);
            replays++;
        }
        const physical = (s: GameState) => JSON.stringify(s, (key, value) => key === 'isHidden' || key === 'hiddenCardsCount' ? undefined : value);
        assert.equal(physical(afterFirst[0]), physical(afterFirst[1]));
        const [a, b] = c.arms;
        const firstDiff = a.moves[1].cardId !== b.moves[1].cardId || a.moves[1].colIndex !== b.moves[1].colIndex || a.moves[1].isHidden !== b.moves[1].isHidden;
        assert.equal(c.firstResponseChanged, firstDiff);
        assert.equal(c.deltaWin, b.win - a.win); assert.equal(c.deltaMargin, b.margin - a.margin);
    }
    const totals: Record<string, Summary> = Object.fromEntries([6, 14, 22].map(ply => [ply, { ply, pairs: 0, firstResponseChanged: 0, improved: 0, worsened: 0, unchanged: 0, sumDeltaWin: 0, sumDeltaMargin: 0 }]));
    for (const c of group.cases) {
        const s = totals[c.ply]; s.pairs++; s.firstResponseChanged += Number(c.firstResponseChanged);
        s[c.deltaWin > 0 ? 'improved' : c.deltaWin < 0 ? 'worsened' : 'unchanged']++;
        s.sumDeltaWin += c.deltaWin; s.sumDeltaMargin += c.deltaMargin;
    }
    assert.deepEqual(group.summary, Object.values(totals));
}
console.log(JSON.stringify({ verified: true, replays, placements, elapsedMs: Date.parse(output.endedUtc) - Date.parse(output.startedUtc) }));
