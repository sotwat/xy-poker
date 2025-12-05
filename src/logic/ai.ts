import type { GameState, Card } from './types';
import { getLearningData } from './aiLearning';

// Enhanced AI with advanced strategies + Learning System
// 1. Evaluate straights (consecutive ranks)
// 2. Consider X-hand (bottom row) strategy
// 3. Weight scores by dice values
// 4. Block opponent's strong columns
// 5. Strategic hidden card placement
// 6. Learn from game outcomes and adapt strategy

export function getBestMove(gameState: GameState, playerIndex: number): { cardId: string, colIndex: number, isHidden: boolean } {
    const player = gameState.players[playerIndex];
    const opponent = gameState.players[playerIndex === 0 ? 1 : 0];
    const hand = player.hand;
    const board = player.board;
    const dice = player.dice;

    // Identify valid columns
    const validColumns: number[] = [];
    for (let c = 0; c < 5; c++) {
        if (board[2][c] === null) {
            validColumns.push(c);
        }
    }

    if (validColumns.length === 0) {
        return { cardId: hand[0]?.id || '', colIndex: 0, isHidden: false };
    }

    let bestMove = { cardId: hand[0].id, colIndex: validColumns[0], isHidden: false };
    let bestScore = -Infinity;

    for (const card of hand) {
        for (const col of validColumns) {
            const currentCards = [board[0][col], board[1][col], board[2][col]];
            const emptySlotIdx = currentCards.findIndex(c => c === null);
            if (emptySlotIdx === -1) continue;

            const potentialCards = [...currentCards];
            potentialCards[emptySlotIdx] = card;

            let score = evaluateColumnPlacement(potentialCards, col, dice[col], emptySlotIdx);

            // X-hand strategy (bottom row)
            if (emptySlotIdx === 2) {
                const learning = getLearningData();
                score += evaluateXHandPotential(board, card, col) * learning.xHandFocus;

                // Bonus for completing column first - INCREASED + LEARNING
                if (opponent.board[2][col] === null) {
                    score += 150 * learning.bonusAggression;
                }
            }

            // Opponent blocking strategy
            score += evaluateOpponentBlock(opponent, col, card, emptySlotIdx);

            // Small randomness for variety
            score += Math.random() * 5;

            if (score > bestScore) {
                bestScore = score;
                bestMove = { cardId: card.id, colIndex: col, isHidden: false };
            }
        }
    }

    // Strategic hidden card placement
    bestMove.isHidden = shouldHideCard(bestMove, hand, player, board);

    return bestMove;
}

function evaluateColumnPlacement(cards: (Card | null)[], _colIndex: number, diceValue: number, _slotIdx: number): number {
    const validCards = cards.filter(c => c !== null) as Card[];
    if (validCards.length === 0) return 0;

    // Get learning data for adaptive strategy
    const learning = getLearningData();

    let score = 0;
    const numCards = validCards.length;

    // Trips (Three of a Kind) - SIGNIFICANTLY INCREASED + LEARNING
    const ranks = validCards.map(c => c.rank);
    const uniqueRanks = new Set(ranks);
    if (numCards === 3 && uniqueRanks.size === 1) {
        score += 400 * diceValue * learning.tripPreference; // Learning applied
    } else if (numCards === 2 && uniqueRanks.size === 1) {
        score += 160 * diceValue * learning.tripPreference;
    }

    // Flush - SIGNIFICANTLY INCREASED + LEARNING
    const suits = validCards.map(c => c.suit).filter(s => s !== 'joker');
    const uniqueSuits = new Set(suits);
    if (uniqueSuits.size === 1 && numCards >= 2) {
        score += 120 * diceValue * learning.flushPreference; // Learning applied
        if (numCards === 3) {
            score += 100 * diceValue * learning.flushPreference;
        }
    }

    // Straight (consecutive ranks) - SIGNIFICANTLY INCREASED + LEARNING
    if (numCards >= 2) {
        const sortedRanks = [...ranks].sort((a, b) => a - b);
        let consecutive = true;
        for (let i = 1; i < sortedRanks.length; i++) {
            if (sortedRanks[i] !== sortedRanks[i - 1] + 1) {
                consecutive = false;
                break;
            }
        }
        if (consecutive) {
            score += 140 * diceValue * learning.straightPreference; // Learning applied
            if (numCards === 3) {
                score += 120 * diceValue * learning.straightPreference;
            }
        }
    }

    // High cards in high dice columns - INCREASED
    const avgRank = ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
    score += avgRank * diceValue * 5;

    // Joker bonus - INCREASED
    if (validCards.some(c => c.suit === 'joker')) {
        score += 200 * diceValue;
    }

    return score;
}

function evaluateXHandPotential(board: (Card | null)[][], newCard: Card, colIndex: number): number {
    // Evaluate bottom row (X-hand) when placing in bottom slot
    const bottomRow = [...board[2]];
    bottomRow[colIndex] = newCard;

    const validCards = bottomRow.filter(c => c !== null) as Card[];
    if (validCards.length < 2) return 0;

    let score = 0;

    // Check for X-hand patterns (similar to Y-hand but for 5 cards)
    const ranks = validCards.map(c => c.rank);
    const suits = validCards.map(c => c.suit).filter(s => s !== 'joker');

    // Pairs, trips, quads - INCREASED
    const rankCounts = new Map<number, number>();
    ranks.forEach(r => rankCounts.set(r, (rankCounts.get(r) || 0) + 1));
    const maxCount = Math.max(...rankCounts.values());

    if (maxCount >= 2) score += maxCount * 60; // Was 30

    // Flush potential - INCREASED
    const uniqueSuits = new Set(suits);
    if (uniqueSuits.size === 1 && validCards.length >= 3) {
        score += 100; // Was 50
    }

    // Straight potential - INCREASED
    const sortedRanks = [...new Set(ranks)].sort((a, b) => a - b);
    if (sortedRanks.length >= 3) {
        let maxConsecutive = 1;
        let current = 1;
        for (let i = 1; i < sortedRanks.length; i++) {
            if (sortedRanks[i] === sortedRanks[i - 1] + 1) {
                current++;
                maxConsecutive = Math.max(maxConsecutive, current);
            } else {
                current = 1;
            }
        }
        if (maxConsecutive >= 3) score += maxConsecutive * 50; // Was 25
    }

    // High cards in bottom row are valuable - INCREASED
    if (newCard.rank >= 12) score += 80; // Was 40
    if (newCard.suit === 'joker') score += 200; // Was 100

    return score;
}

function evaluateOpponentBlock(opponent: GameState['players'][0], colIndex: number, _card: Card, _slotIdx: number): number {
    const oppCol = [opponent.board[0][colIndex], opponent.board[1][colIndex], opponent.board[2][colIndex]];
    const oppCards = oppCol.filter(c => c !== null) as Card[];

    if (oppCards.length < 2) return 0;

    // Check if opponent has a strong hand forming
    const oppRanks = oppCards.map(c => c.rank);
    const oppSuits = oppCards.map(c => c.suit).filter(s => s !== 'joker');

    let blockValue = 0;

    // Opponent has pair/trips
    const uniqueOppRanks = new Set(oppRanks);
    if (uniqueOppRanks.size === 1) {
        blockValue += 30; // Blocking their trips
    }

    // Opponent has flush
    const uniqueOppSuits = new Set(oppSuits);
    if (uniqueOppSuits.size === 1 && oppCards.length >= 2) {
        blockValue += 25;
    }

    // We can't really "block" by placing in our own board, but we can prioritize
    // completing our columns faster than opponent
    return blockValue;
}

function shouldHideCard(move: { cardId: string, colIndex: number }, hand: Card[], player: GameState['players'][0], _board: (Card | null)[][]): boolean {
    if (player.hiddenCardsCount >= 3) return false;

    const card = hand.find(c => c.id === move.cardId);
    if (!card || card.suit === 'joker') return false;

    const learning = getLearningData();

    // Strategic hiding: Hide high-value cards in important columns
    const col = move.colIndex;
    const diceValue = player.dice[col];

    // Hide high cards (J, Q, K, A) in high dice columns (4, 5, 6)
    if (card.rank >= 11 && diceValue >= 4) {
        return Math.random() < (0.4 * learning.hidingStrategy / 0.3); // Adapt based on learning
    }

    // Hide strategically to prevent opponent from reading our hand
    if (card.rank >= 10) {
        return Math.random() < (0.25 * learning.hidingStrategy / 0.3);
    }

    return false;
}
