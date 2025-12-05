import type { GameState, Card } from './types';


// Heuristic AI
// 1. Check if we can complete a strong Y hand (Trip, Straight, Flush).
// 2. Check if we can trigger "First to 3" bonus.
// 3. Avoid placing where we are already full.
// 4. If no obvious move, place in empty or developing column.

export function getBestMove(gameState: GameState, playerIndex: number): { cardId: string, colIndex: number, isHidden: boolean } {
    const player = gameState.players[playerIndex];
    const hand = player.hand;
    const board = player.board;
    const dice = player.dice;

    // 1. Identify valid moves
    // We can place any card in any column that is not full.
    const validColumns: number[] = [];
    for (let c = 0; c < 5; c++) {
        // Check if column is full (row 2 is occupied)
        if (board[2][c] === null) {
            validColumns.push(c);
        }
    }

    if (validColumns.length === 0) {
        // Should not happen if game logic is correct (hand size check)
        // But return safe fallback
        return { cardId: hand[0]?.id || '', colIndex: 0, isHidden: false };
    }

    // 2. Evaluate moves
    let bestMove = { cardId: hand[0].id, colIndex: validColumns[0], isHidden: false };
    let bestScore = -Infinity;

    for (const card of hand) {
        for (const col of validColumns) {
            // Simulate placement
            // We need to see what the column would look like.
            const currentCards = [board[0][col], board[1][col], board[2][col]];
            // Find first empty slot
            const emptySlotIdx = currentCards.findIndex(c => c === null);
            if (emptySlotIdx === -1) continue; // Should be covered by validColumns check

            // Construct potential column
            const potentialCards = [...currentCards];
            potentialCards[emptySlotIdx] = card;

            // If column is not full (less than 3 cards), evaluation is partial.
            // We can evaluate "potential".
            // Or just simple heuristics.

            let score = 0;
            const cardsInCol = potentialCards.filter(c => c !== null) as Card[];

            // Heuristic: Match Ranks (Pairs/Trips)
            const ranks = cardsInCol.map(c => c.rank);
            const uniqueRanks = new Set(ranks);
            if (cardsInCol.length === 2 && uniqueRanks.size === 1) score += 50; // Pair
            if (cardsInCol.length === 3 && uniqueRanks.size === 1) score += 100; // Trips

            // Heuristic: Match Suits (Flush)
            const suits = cardsInCol.map(c => c.suit);
            const uniqueSuits = new Set(suits.filter(s => s !== 'joker'));
            if (uniqueSuits.size === 1 && cardsInCol.length > 1) score += 30; // Flush potential

            // Heuristic: High Cards in High Dice columns
            const diceVal = dice[col];
            if (card.rank >= 10) score += diceVal * 2;

            // 2. Bonus Opportunity (First to fill column)
            // If placing this card fills the column (idx 2), check if opponent has filled it.
            if (emptySlotIdx === 2) {
                const opponent = gameState.players[playerIndex === 0 ? 1 : 0];
                const oppColFull = opponent.board[2][col] !== null;
                if (!oppColFull) {
                    score += 50; // High priority for bonus
                }
            }

            // Randomness
            score += Math.random() * 10;

            if (score > bestScore) {
                bestScore = score;
                bestMove = { cardId: card.id, colIndex: col, isHidden: false };
            }
        }
    }

    // Hidden Card Logic
    // 10% chance to hide if allowed
    if (player.hiddenCardsCount < 3 && bestMove.cardId) {
        const card = hand.find(c => c.id === bestMove.cardId);
        if (card && card.suit !== 'joker' && Math.random() < 0.1) {
            bestMove.isHidden = true;
        }
    }

    return bestMove;
}
