import { createDeck } from './deck';
import type { Card, GameState } from './types';

export function certificateKnowledge(state: GameState, playerIndex: 0 | 1): { knownOwnIds: string[]; unseen: Card[] } | null {
    if (!Array.isArray(state.players) || state.players.length !== 2) return null;
    const own = state.players[playerIndex], opponent = state.players[1 - playerIndex];
    const boardShape = (board: (Card | null)[][]) => Array.isArray(board) && board.length === 3
        && Array.from(board).every(row => Array.isArray(row) && row.length === 5 && Array.from(row).every(card =>
            card === null || (card && typeof card === 'object' && (card.isHidden === undefined || typeof card.isHidden === 'boolean'))));
    if (!own || !opponent || !Array.isArray(own.hand) || !boardShape(own.board) || !boardShape(opponent.board)) return null;
    const dice = state.players[0].dice;
    if (!Array.isArray(dice) || dice.length !== 5 || Array.from(dice).some(die => !Number.isInteger(die) || die < 1 || die > 6)
        || !Array.isArray(state.players[1].dice) || state.players[1].dice.length !== 5
        || Array.from(state.players[1].dice).some((die, index) => die !== dice[index])) return null;
    const ownCards = [...own.hand, ...own.board.flat().filter((card): card is Card => card !== null)];
    const knownCards = [...ownCards, ...opponent.board.flat().filter((card): card is Card => card !== null && !card.isHidden)];
    const deck = createDeck(), canonical = new Map(deck.map(card => [card.id, card]));
    if (knownCards.some(card => {
        const expected = card && canonical.get(card.id);
        return !expected || expected.rank !== card.rank || expected.suit !== card.suit;
    })) return null;
    const known = new Set(knownCards.map(card => card.id));
    if (known.size !== knownCards.length) return null;
    return { knownOwnIds: ownCards.map(card => card.id), unseen: deck.filter(card => !known.has(card.id)) };
}
