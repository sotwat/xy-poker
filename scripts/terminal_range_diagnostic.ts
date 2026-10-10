import assert from 'node:assert/strict';
import { createDeck } from '../src/logic/deck';
import { gameReducer } from '../src/logic/game';
import { scoreGtoMove, XY_GTO_A7 } from '../src/logic/gtoPolicy';
import type { Card, GameState } from '../src/logic/types';
import { terminalReplyView } from './terminal_reply';
import { chooseTerminalReply, prepareTerminalPayoffs, setTerminalReplyEnabled } from './terminal_reply_batched';

export function rangePrediction(state: GameState, seed: number, samples = 256) {
    assert.ok(Number.isInteger(samples) && samples > 0);
    const actor = state.currentPlayerIndex as 0 | 1, view = terminalReplyView(state, actor); assert.ok(view);
    const colIndex = view.ownBoard[2].findIndex(c => !c);
    const scores = view.hand.map(card => scoreGtoMove(state, actor, card, colIndex, XY_GTO_A7));
    const baselineIndex = scores.reduce((best, score, i) => score > scores[best] ? i : best, 0);
    const baseline = { cardId: view.hand[baselineIndex].id, colIndex, isHidden: false };
    setTerminalReplyEnabled(true); const candidate = chooseTerminalReply(state, actor, baseline);
    const candidateIndex = view.hand.findIndex(c => c.id === candidate.cardId); assert.ok(candidateIndex >= 0);
    const knownCards = [...view.hand, ...view.ownBoard.flat(), ...view.opponentBoard.flat()].filter((c): c is Card => c !== null);
    const known = new Set(knownCards.map(c => c.id)); assert.equal(known.size, knownCards.length);
    const unseen = createDeck().filter(c => !known.has(c.id));
    const hidden: Array<[number, number]> = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) if (!view.opponentBoard[r][c]) hidden.push([r, c]);
    const payoffs = prepareTerminalPayoffs(view.ownBoard, view.hand, colIndex, view.dice, actor);
    let n = seed >>> 0;
    const random = () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
    const predicted = view.hand.map(card => ({ cardId: card.id, utility: 0, shaped: 0 }));
    for (let sample = 0; sample < samples; sample++) {
        const pool = [...unseen], board = view.opponentBoard.map(r => [...r]) as Card[][];
        for (const [r, c] of hidden) { const i = Math.floor(random() * pool.length); board[r][c] = pool[i]; pool.splice(i, 1); }
        const ids: string[] = [...view.hand, ...view.ownBoard.flat().filter((c): c is Card => c !== null), ...board.flat()].map(c => c.id);
        assert.equal(new Set(ids).size, ids.length);
        payoffs(board).forEach((value, i) => {
            predicted[i].utility += value.utility / samples;
            predicted[i].shaped += (value.utility + Math.max(-0.45, Math.min(0.45, value.margin / 40))) / samples;
        });
    }
    return { actor, colIndex, baselineIndex, candidateIndex, hidden: hidden.length, samples, predicted };
}

export function actualTerminalValues(state: GameState) {
    const actor = state.currentPlayerIndex as 0 | 1, own = state.players[actor], colIndex = own.board[2].findIndex(c => !c);
    const values = prepareTerminalPayoffs(own.board, own.hand, colIndex, own.dice, actor)(state.players[1 - actor].board as Card[][]);
    return own.hand.map((card, i) => {
        const placed = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId: card.id, colIndex, isHidden: false } });
        assert.equal(placed.phase, 'scoring');
        const end = gameReducer(placed, { type: 'CALCULATE_SCORE' }); assert.equal(end.phase, 'ended');
        const value = { utility: end.winner === 'draw' ? 0 : end.winner === own.id ? 1 : -1, margin: end.players[actor].score - end.players[1 - actor].score };
        assert.deepEqual(values[i], value);
        return { cardId: card.id, ...value };
    });
}
