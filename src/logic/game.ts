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
    | {
        type: 'START_GAME'; payload?: {
            initialDice?: number[];
            initialDeck?: Card[];
            startingPlayer?: number;
            playerConfig?: {
                p1: { id: string; isPremium: boolean };
                p2: { id: string; isPremium: boolean };
            }
        }
    }
    | { type: 'CHOOSE_TURN_ORDER'; payload: { startingPlayer: number } }
    | { type: 'PLACE_AND_DRAW'; payload: { cardId: string; colIndex: number; isHidden: boolean } }
    | { type: 'SYNC_STATE'; payload: GameState }
    | { type: 'CALCULATE_SCORE' };

const PHASES = new Set(['setup', 'turn_selection', 'playing', 'scoring', 'ended']);

function isCard(value: unknown): value is Card {
    if (!value || typeof value !== 'object') return false;
    const card = value as Partial<Card>;
    return typeof card.id === 'string'
        && card.id.length <= 40
        && ['hearts', 'diamonds', 'clubs', 'spades'].includes(card.suit || '')
        && Number.isInteger(card.rank)
        && Number(card.rank) >= 2
        && Number(card.rank) <= 14
        && (card.isHidden === undefined || typeof card.isHidden === 'boolean');
}

export function isValidGameState(value: unknown): value is GameState {
    if (!value || typeof value !== 'object') return false;
    const state = value as Partial<GameState>;
    if (!Array.isArray(state.players) || state.players.length !== 2) return false;
    if (state.currentPlayerIndex !== 0 && state.currentPlayerIndex !== 1) return false;
    if (!state.phase || !PHASES.has(state.phase)) return false;
    if (!Array.isArray(state.deck) || state.deck.length > 52 || !state.deck.every(isCard)) return false;
    if (!Number.isInteger(state.turnCount) || Number(state.turnCount) < 0 || Number(state.turnCount) > 100) return false;
    if (![null, 'p1', 'p2', 'draw'].includes(state.winner ?? null)) return false;

    return state.players.every(player => {
        if (!player || typeof player !== 'object') return false;
        if (typeof player.id !== 'string' || player.id.length > 128) return false;
        if (!Array.isArray(player.hand) || player.hand.length > 20 || !player.hand.every(isCard)) return false;
        if (!Array.isArray(player.dice)) return false;
        const validDiceLength = state.phase === 'setup' ? player.dice.length === 0 : player.dice.length === 5;
        if (!validDiceLength
            || !player.dice.every(die => Number.isInteger(die) && die >= 1 && die <= 6)) return false;
        if (!Number.isFinite(player.score) || player.score < 0) return false;
        if (!Number.isInteger(player.hiddenCardsCount) || player.hiddenCardsCount < 0 || player.hiddenCardsCount > 3) return false;
        if (!Number.isInteger(player.bonusesClaimed) || player.bonusesClaimed < 0 || player.bonusesClaimed > 5) return false;
        if (player.isPremium !== undefined && typeof player.isPremium !== 'boolean') return false;
        if (!Array.isArray(player.board) || player.board.length !== 3) return false;
        return player.board.every(row => Array.isArray(row)
            && row.length === 5
            && row.every(card => card === null || isCard(card)));
    });
}

export function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
        case 'START_GAME': {
            // Use provided deck (Synced Online) or create new shuffled one (Local/Fallback)
            const suppliedDeck = action.payload?.initialDeck;
            const deck = suppliedDeck?.length === 52 && suppliedDeck.every(isCard)
                ? [...suppliedDeck]
                : shuffleDeck(createDeck());

            const { drawn: p1Hand, remaining: deck1 } = drawCards(deck, 4);
            const { drawn: p2Hand, remaining: deck2 } = drawCards(deck1, 4);

            // Both players use the same validated dice values.
            const suppliedDice = action.payload?.initialDice;
            const dice = suppliedDice?.length === 5
                && suppliedDice.every(die => Number.isInteger(die) && die >= 1 && die <= 6)
                ? [...suppliedDice]
                : Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a);

            // Randomize starting player (or use synced online)
            const suppliedStartingPlayer = action.payload?.startingPlayer;
            const startingPlayer = (suppliedStartingPlayer === 0 || suppliedStartingPlayer === 1)
                ? suppliedStartingPlayer
                : Math.floor(Math.random() * 2);

            return {
                ...INITIAL_GAME_STATE,
                phase: 'turn_selection',
                deck: deck2,
                currentPlayerIndex: startingPlayer,
                players: [
                    {
                        ...INITIAL_PLAYER_STATE,
                        id: action.payload?.playerConfig?.p1.id || 'p1',
                        hand: p1Hand,
                        dice,
                        isPremium: action.payload?.playerConfig?.p1.isPremium
                    },
                    {
                        ...INITIAL_PLAYER_STATE,
                        id: action.payload?.playerConfig?.p2.id || 'p2',
                        hand: p2Hand,
                        dice,
                        isPremium: action.payload?.playerConfig?.p2.isPremium
                    },
                ],
                turnCount: 1,
            };
        }
        
        case 'CHOOSE_TURN_ORDER': {
            if (state.phase !== 'turn_selection') return state;
            if (action.payload.startingPlayer !== 0 && action.payload.startingPlayer !== 1) return state;
            return {
                ...state,
                phase: 'playing',
                currentPlayerIndex: action.payload.startingPlayer,
            };
        }

        case 'PLACE_AND_DRAW': {
            const { cardId, colIndex, isHidden } = action.payload;
            if (state.phase !== 'playing') return state;
            if (!Number.isInteger(colIndex) || colIndex < 0 || colIndex >= 5) return state;
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

            let nextPhase: GameState['phase'] = state.phase;
            if (p1Full && p2Full) {
                nextPhase = 'scoring';
            }

            // Auto-pass if the next player's board is full
            let actualNextPlayerIdx = nextPlayerIdx;
            if (actualNextPlayerIdx === 0 && p1Full && !p2Full) {
                actualNextPlayerIdx = 1; // pass back to p2
            } else if (actualNextPlayerIdx === 1 && p2Full && !p1Full) {
                actualNextPlayerIdx = 0; // pass back to p1
            }

            return {
                ...state,
                players: newPlayers,
                deck: deckAfterDraw,
                currentPlayerIndex: actualNextPlayerIdx,
                phase: nextPhase,
                turnCount: state.turnCount + 1,
            };
        }

        case 'CALCULATE_SCORE': {
            if (state.phase !== 'scoring') return state;
            if (!state.players.every(player => player.board.every(row => row.every(card => card !== null)))) return state;
            // 1. Reveal Hidden Cards (already done visually by phase change, but logic needs to know)
            // 2. Evaluate Y Hands
            let p1Score = 0;
            let p2Score = 0;

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
            return isValidGameState(action.payload) ? action.payload : state;
        default:
            return state;
    }
}
