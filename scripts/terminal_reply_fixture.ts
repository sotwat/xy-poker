import assert from 'node:assert/strict';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
function rng(seed: number) { let n = seed; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
export function terminalState(seed: number) {
    const random = rng(seed), deck = createDeck();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const first = seed % 2;
    let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck: deck, initialDice: [6, 4, 3, 2, 1], startingPlayer: first } });
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: first } });
    for (let i = 0; i < 29; i++) {
        const own = state.players[state.currentPlayerIndex], columns = own.board[2].flatMap((c, col) => c ? [] : [col]);
        const colIndex = columns[Math.floor(random() * columns.length)], cardId = own.hand[Math.floor(random() * own.hand.length)].id;
        const isHidden = random() < 0.3 && own.hiddenCardsCount < 3 && own.board.filter(r => r[colIndex]?.isHidden).length < 2;
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId, colIndex, isHidden } });
        assert.notEqual(next, state); state = next;
    }
    return state;
}
