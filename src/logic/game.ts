import type { GameState, PlayerState, Card } from './types';
import { createDeck, shuffleDeck, drawCards } from './deck';
import { evaluateYHand, evaluateXHand } from './evaluation';
import { calculateXHandScores } from './scoring';

export const INITIAL_PLAYER_STATE: PlayerState = {
    id: '',
    hand: [],
    board: Array(3).fill(null).map(() => Array(5).fill(null)), // 3 rows, 5 cols
    dice: [],
    score: 0,
    hiddenCardsCount: 0,
    bonusesClaimed: 0,
};

export const INITIAL_GAME_STATE: GameState = {
    players: [
        { ...INITIAL_PLAYER_STATE, id: 'p1' },
        { ...INITIAL_PLAYER_STATE, id: 'p2' },
    ],
    currentPlayerIndex: 0,
    phase: 'setup',
    deck: [],
    turnCount: 0,
    winner: null,
};

export type GameAction =
    | { type: 'START_GAME' }
    | { type: 'PLACE_CARD'; cardId: string; colIndex: number }
    | { type: 'DRAW_CARD' }
    | { type: 'TOGGLE_HIDDEN'; cardId: string } // Only for cards on board? Or during placement? "Hidden placement". Usually you decide when placing.
    // Rules: "Can place hidden". "Max 3". "Joker cannot be hidden".
    // Let's assume we toggle "isHidden" flag on the card in hand BEFORE placing, or we have a specific "PLACE_HIDDEN" action?
    // Or we place it, then toggle?
    // "Card placement rules: ... Hidden cards: ... can place up to 3".
    // Probably best to have a UI toggle "Place Face Down" then click the slot.
    // So PLACE_CARD can have `isHidden` param.
    | { type: 'PLACE_AND_DRAW'; payload: { cardId: string; colIndex: number; isHidden: boolean } }
    | { type: 'SYNC_STATE'; payload: GameState }
    | { type: 'UNDO_LAST_ACTION' } // "Action cancellation: After placement, before draw".
    | { type: 'END_TURN' }
    | { type: 'CALCULATE_SCORE' };

export function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
        case 'START_GAME': {
            const deck = shuffleDeck(createDeck()); // No Jokers
            const { drawn: p1Hand, remaining: deck1 } = drawCards(deck, 4);
            const { drawn: p2Hand, remaining: deck2 } = drawCards(deck1, 4);

            // Roll dice for each player (5 dice each? Or shared? "Roll 5 dice, arrange on top of board".
            // "Setup: 1. Roll 5 dice, arrange corresponding to each column".
            // Usually in these games, the dice are shared or per-column.
            // "Scoring: Compare Y hand ... acquire dice points".
            // So there is ONE set of 5 dice for the board columns?
            // "Setup: 1. Roll 5 dice...".
            // "Scoring: ... acquire points of the dice assigned to that column".
            // This implies 5 dice total, shared for the columns.
            // Let's store dice in GameState, not PlayerState?
            // Or maybe each player has dice?
            // "Play number: 2". "Setup: 1. Roll 5 dice...".
            // It sounds like 5 dice are rolled once and placed at the top of the board (shared).
            // Let's assume SHARED dice.
            // But I put `dice` in `PlayerState` in types.ts.
            // I should move it to `GameState` or duplicate it.
            // Let's put it in `GameState` for now, or just give both players the same dice values if they are shared.
            // Actually, if it's "Arrange on top of board", and it's 1v1, maybe they face each other?
            // "3x5 board".
            // If they share the board, it's different.
            // "Construct 3x5 board". "Each player constructs"?
            // "Setup: ... distribute 4 cards to each player".
            // "Turn: Place card ...".
            // "Scoring: Compare Y hand ...".
            // This implies each player has their OWN 3x5 board.
            // And the dice are for the columns.
            // Are the dice values the same for both players?
            // "Roll 5 dice...".
            // Usually yes, the dice values are the "stakes" for each column.
            // So I will generate 5 dice values and give them to both players (or store in GameState).

            const dice = Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a);

            // Randomize starting player
            const startingPlayer = Math.floor(Math.random() * 2);

            return {
                ...INITIAL_GAME_STATE,
                phase: 'playing',
                deck: deck2,
                currentPlayerIndex: startingPlayer, // Rules: "Janken determines first". Now randomized.
                players: [
                    { ...INITIAL_PLAYER_STATE, id: 'p1', hand: p1Hand, dice },
                    { ...INITIAL_PLAYER_STATE, id: 'p2', hand: p2Hand, dice },
                ],
                turnCount: 1,
            };
        }

        case 'PLACE_AND_DRAW': {
            const { cardId, colIndex, isHidden } = action.payload;
            const playerIdx = state.currentPlayerIndex;
            const player = state.players[playerIdx];

            // Find card in hand
            const cardIndex = player.hand.findIndex(c => c.id === cardId);
            if (cardIndex === -1) return state; // Error
            const card = player.hand[cardIndex];

            // Validation
            // 1. Check Hidden limit
            if (isHidden) {
                if (player.hiddenCardsCount >= 3) return state; // Max 3
                if (card.suit === 'joker') return state; // Joker cannot be hidden
                // "Cannot hide all 3 cards in a column".
                // We check this when placing the 3rd card?
                // If col has 2 hidden cards, and we place 3rd hidden -> Invalid.
                let hiddenInCol = 0;
                for (let r = 0; r < 3; r++) {
                    if (player.board[r][colIndex]?.isHidden) hiddenInCol++;
                }
                if (hiddenInCol >= 2) return state; // Cannot have 3 hidden
            }

            // 2. Check Placement Rule (Stacking)
            // Find first empty row in this column
            let targetRow = -1;
            for (let r = 0; r < 3; r++) {
                if (player.board[r][colIndex] === null) {
                    targetRow = r;
                    break;
                }
            }
            if (targetRow === -1) return state; // Column full

            // 3. Check "First card must be Row 1" (Row 0 in our 0-indexed array)
            // "Initial placement: Must be Row 1".
            // This means if the board is empty, you must place in Row 0?
            // Actually, "Row 1" usually means the top row.
            // Since we fill from top (Row 0) to bottom (Row 2), this is naturally enforced by gravity.
            // Unless "Row 1" means "Any column, but must be the first slot".
            // Which is what we do.
            // Wait, "First card ... must be 1st row".
            // Yes, naturally.

            // Update State (Placement)
            const newBoard = player.board.map(row => [...row]);
            const placedCard = { ...card, isHidden };
            newBoard[targetRow][colIndex] = placedCard;

            const newHand = [...player.hand];
            newHand.splice(cardIndex, 1);

            const newPlayer = {
                ...player,
                board: newBoard,
                hand: newHand,
                hiddenCardsCount: isHidden ? player.hiddenCardsCount + 1 : player.hiddenCardsCount,
            };

            // Check "Per-Column" Bonus
            // "First player to fill a specific column gets 1 bonus card".
            // We just filled `colIndex` (targetRow === 2).
            // Check if opponent has this column filled.

            let bonusesClaimed = player.bonusesClaimed;
            let cardsToDraw = 0;

            if (targetRow === 2) {
                const opponent = state.players[playerIdx === 0 ? 1 : 0];
                // Check if opponent has this column full (row 2 is filled)
                const oppColFull = opponent.board[2][colIndex] !== null;

                if (!oppColFull) {
                    // Opponent hasn't filled this column yet. We are first!
                    bonusesClaimed += 1;
                    cardsToDraw = 1;
                }
            }

            // Draw bonus cards if any
            let currentDeck = state.deck;
            let finalHand = newPlayer.hand;

            if (cardsToDraw > 0) {
                const { drawn, remaining } = drawCards(currentDeck, cardsToDraw);
                currentDeck = remaining;
                finalHand = [...finalHand, ...drawn];
            }

            // --- AUTO DRAW & END TURN LOGIC ---

            // Draw 1 card (Standard Draw)
            const { drawn: standardDrawn, remaining: deckAfterDraw } = drawCards(currentDeck, 1);
            finalHand = [...finalHand, ...standardDrawn];

            const finalPlayerState = { ...newPlayer, hand: finalHand, bonusesClaimed };
            const newPlayers = [...state.players] as [PlayerState, PlayerState];
            newPlayers[playerIdx] = finalPlayerState;

            // End Turn
            const nextPlayerIdx = playerIdx === 0 ? 1 : 0;

            // Check Game End
            // "Game ends when both players have filled 15 cards".
            const p1Full = newPlayers[0].board.every(row => row.every(c => c !== null));
            const p2Full = newPlayers[1].board.every(row => row.every(c => c !== null));

            let nextPhase = state.phase;
            if (p1Full && p2Full) {
                nextPhase = 'scoring';
            }

            return {
                ...state,
                players: newPlayers,
                deck: deckAfterDraw,
                currentPlayerIndex: nextPlayerIdx,
                phase: nextPhase,
                turnCount: state.turnCount + 1,
            };
        }

        case 'DRAW_CARD': {
            // This action is now deprecated as PLACE_AND_DRAW handles the draw.
            // It's kept here for now but should ideally be removed if PLACE_AND_DRAW is the only way to end a turn.
            // Draw 1 card
            const playerIdx = state.currentPlayerIndex;
            const player = state.players[playerIdx];
            const { drawn, remaining } = drawCards(state.deck, 1);

            const newPlayers = [...state.players] as [PlayerState, PlayerState];
            newPlayers[playerIdx] = {
                ...player,
                hand: [...player.hand, ...drawn],
            };

            // End Turn
            const nextPlayerIdx = playerIdx === 0 ? 1 : 0;

            // Check Game End
            // "Game ends when both players have filled 15 cards".
            const p1Full = newPlayers[0].board.every(row => row.every(c => c !== null));
            const p2Full = newPlayers[1].board.every(row => row.every(c => c !== null));

            let nextPhase = state.phase;
            if (p1Full && p2Full) {
                nextPhase = 'scoring';
            }

            return {
                ...state,
                players: newPlayers,
                deck: remaining,
                currentPlayerIndex: nextPlayerIdx,
                phase: nextPhase,
                turnCount: state.turnCount + 1,
            };
        }

        case 'CALCULATE_SCORE': {
            // 1. Reveal Hidden Cards (already done visually by phase change, but logic needs to know)
            // 2. Evaluate Y Hands
            let p1Score = state.players[0].score;
            let p2Score = state.players[1].score;

            const p1Board = state.players[0].board;
            const p2Board = state.players[1].board;
            const dice = state.players[0].dice; // Shared dice

            // Y Hands (Columns)
            for (let col = 0; col < 5; col++) {
                const p1Cards = [p1Board[0][col]!, p1Board[1][col]!, p1Board[2][col]!];
                const p2Cards = [p2Board[0][col]!, p2Board[1][col]!, p2Board[2][col]!];

                const p1Res = evaluateYHand(p1Cards, dice[col]);
                const p2Res = evaluateYHand(p2Cards, dice[col]);

                // Compare
                if (p1Res.rankValue > p2Res.rankValue) {
                    p1Score += dice[col];
                } else if (p2Res.rankValue > p1Res.rankValue) {
                    p2Score += dice[col];
                } else {
                    // Tie in rank, check kickers
                    let p1Wins = false;
                    let p2Wins = false;
                    for (let k = 0; k < Math.max(p1Res.kickers.length, p2Res.kickers.length); k++) {
                        const k1 = p1Res.kickers[k] || 0;
                        const k2 = p2Res.kickers[k] || 0;
                        if (k1 > k2) { p1Wins = true; break; }
                        if (k2 > k1) { p2Wins = true; break; }
                    }

                    if (p1Wins) p1Score += dice[col];
                    else if (p2Wins) p2Score += dice[col];
                    // Complete tie: 0 points
                }
            }

            // X Hands (Bottom Row - Row 2)
            const p1XCards = p1Board[2] as Card[]; // Cast safe if board full
            const p2XCards = p2Board[2] as Card[];

            const p1XRes = evaluateXHand(p1XCards);
            const p2XRes = evaluateXHand(p2XCards);

            // Base points and bonus logic now in scoring.ts
            const { p1Score: p1XScore, p2Score: p2XScore } = calculateXHandScores(p1XRes, p2XRes);

            // Check Royal Flush Victory
            if (p1XRes.type === 'RoyalFlush') return { ...state, winner: 'p1', phase: 'ended' };
            if (p2XRes.type === 'RoyalFlush') return { ...state, winner: 'p2', phase: 'ended' };

            p1Score += p1XScore;
            p2Score += p2XScore;

            const winner = p1Score > p2Score ? 'p1' : (p2Score > p1Score ? 'p2' : 'draw');

            return {
                ...state,
                players: [
                    { ...state.players[0], score: p1Score },
                    { ...state.players[1], score: p2Score },
                ],
                winner,
                phase: 'ended',
            };
        }

        case 'SYNC_STATE':
            return action.payload;
        default:
            return state;
    }
}
