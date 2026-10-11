import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeck } from '../src/logic/deck';
import { predictHiddenRankRelation, scoreHiddenRankRelation } from './hidden_rank_relation';
import { terminalState } from './terminal_reply_fixture';

test('Known-card-adjusted rank probability equals exhaustive marginal without replacement', () => {
    let checked = 0;
    for (let seed = 1005128001; seed < 1005128061; seed++) {
        const state = terminalState(seed), actor = state.currentPlayerIndex as 0 | 1;
        const predicted = predictHiddenRankRelation(state, actor);
        if (!predicted) continue;
        const unseen = createDeck().filter(c => !predicted.knownIds.includes(c.id));
        for (const slot of predicted.slots) {
            let count = 0, total = 0;
            for (const first of unseen) for (const second of unseen) if (first.id !== second.id) {
                total++; count += Number(slot.publicRanks.includes(first.rank));
            }
            assert.ok(Math.abs(slot.probability - count / total) < 1e-12);
            assert.equal(slot.matching, slot.publicRanks.reduce((n, rank): number => n + 4 - predicted.knownIds.filter(id => Number(id.split('-')[1]) === rank).length, 0));
            checked++;
        }
    }
    assert.ok(checked > 30);
});

test('Private cards never enter forecast; empty public columns are ineligible and inputs are unchanged', () => {
    for (let seed = 1005128101; seed < 1005128131; seed++) {
        const state = terminalState(seed), before = structuredClone(state), actor = state.currentPlayerIndex as 0 | 1;
        const predicted = predictHiddenRankRelation(state, actor), scored = scoreHiddenRankRelation(state, actor);
        assert.equal(!!predicted, !!scored);
        const changed = structuredClone(state);
        changed.deck.reverse();
        for (const c of [...changed.players[1 - actor].hand, ...changed.players[1 - actor].board.flat().filter(c => c?.isHidden)]) {
            if (c) { c.id = 'private'; c.rank = 14; c.suit = 'hearts'; }
        }
        assert.deepEqual(predictHiddenRankRelation(changed, actor), predicted);
        assert.deepEqual(state, before);
        changed.players[1 - actor].board.forEach(row => row.forEach(c => { if (c) c.isHidden = true; }));
        assert.equal(predictHiddenRankRelation(changed, actor), null);
    }
});
