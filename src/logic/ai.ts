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

    // STRATEGY 1: Dice Average Context
    const avgDice = dice.reduce((a, b) => a + b, 0) / 5;
    // High average -> Y-Hand is critical. Low average -> X-Hand is critical.
    const isHighStakes = avgDice >= 3.5;

    const yHandWeight = isHighStakes ? 1.2 : 0.8;
    const xHandWeight = isHighStakes ? 0.8 : 1.2;

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

    // Shuffle columns to avoid left-side bias in ties
    validColumns.sort(() => Math.random() - 0.5);

    let bestMove = { cardId: hand[0].id, colIndex: validColumns[0], isHidden: false };
    let bestScore = -Infinity;

    for (const card of hand) {
        for (const col of validColumns) {
            const currentCards = [board[0][col], board[1][col], board[2][col]];
            const emptySlotIdx = currentCards.findIndex(c => c === null);
            if (emptySlotIdx === -1) continue;

            const potentialCards = [...currentCards];
            potentialCards[emptySlotIdx] = card;

            const diceValue = dice[col];

            // 1. Evaluate Column (Y-Hand)
            let score = evaluateColumnPlacement(potentialCards, diceValue) * yHandWeight;

            // STRATEGY: Spread Moves (Human-like behavior)
            // Reward starting new columns slightly to prevent just stacking one column vertically.
            if (emptySlotIdx === 0) {
                score += 120; // Spread bonus (Increased to prevent clustering)
            }

            // STRATEGY 2: Low Value Column Sacrifice (Rush Bonus)
            // If dice is 1 or 2, winning is low value.
            // If we can finish the column (slot 2) quickly, we get a bonus card.
            // But we must be careful not to ruin X-Hand (Row 2).
            if (diceValue <= 2) {
                // Reduce emphasis on making a "strong" hand here
                score *= 0.7;

                // Reward filling the column (Speed), but less aggressively
                if (emptySlotIdx === 2) {
                    // Check if opponent hasn't filled it yet
                    if (opponent.board[2][col] === null) {
                        score += 100; // Reduced from 250 to avoid obsessive rushing
                    }
                }
            }

            // X-hand strategy (bottom row)
            if (emptySlotIdx === 2) {
                const learning = getLearningData();
                const xScore = evaluateXHandPotential(board, card, col) * learning.xHandFocus;

                // If rushing a low value col, X-Hand quality matters LESS (sacrifice),
                // but we still shouldn't break a Royal Flush potential if possible.
                // We apply xHandWeight to the "Strategic Value" of the X-Hand.
                score += xScore * xHandWeight;
            }

            // Opponent blocking strategy
            score += evaluateOpponentBlock(opponent, col);

            // Small randomness for variety
            score += Math.random() * 5;

            if (score > bestScore) {
                bestScore = score;
                bestMove = { cardId: card.id, colIndex: col, isHidden: false };
            }
        }
    }

    // Strategic hidden card placement
    // STRATEGY 4: Use Hidden Cards Early
    bestMove.isHidden = shouldHideCard(bestMove, hand, player, board, gameState.turnCount);

    return bestMove;
}

function evaluateColumnPlacement(cards: (Card | null)[], diceValue: number): number {
    const validCards = cards.filter(c => c !== null) as Card[];
    if (validCards.length === 0) return 0;

    const learning = getLearningData();
    let score = 0;
    const numCards = validCards.length;
    const ranks = validCards.map(c => c.rank);
    const sortedRanks = [...ranks].sort((a, b) => a - b);
    const maxRank = sortedRanks[sortedRanks.length - 1];
    const avgRank = ranks.reduce((sum, r) => sum + r, 0) / ranks.length;

    // --- BASE SCORES (Rank & Usage) ---
    // Instead of raw AvgRank * Dice, we assess "Quality of Placement".

    // 1. High Card Bonus (only if alone or synergy)
    // In high stakes columns, we want High Cards.
    if (diceValue >= 4) {
        if (maxRank >= 11) score += 50 * diceValue; // Good use of high dice
        else if (maxRank <= 8 && numCards === 1) score -= 30 * diceValue; // WASTE of high dice (Opportunity Cost)
    }

    // --- SYNERGY CHECKS ---
    let isConsecutive = false;
    let isGapConsecutive = false; // e.g. 5, 7 (needs 6)

    if (numCards >= 2) {
        let cons = true;
        for (let i = 1; i < sortedRanks.length; i++) {
            if (sortedRanks[i] !== sortedRanks[i - 1] + 1) {
                cons = false;
                break;
            }
        }
        isConsecutive = cons;

        // Check for 1-gap (e.g. 5, 7) - Good for Straight potential
        if (!isConsecutive && numCards === 2 && sortedRanks[1] === sortedRanks[0] + 2) {
            isGapConsecutive = true;
        }
    }

    // Pure Multiplier (Ordered & Adjacent)
    const pureMultiplier = (isConsecutive && diceValue >= 4) ? 1.5 : 1.0;

    // 2. Pairs / Trips
    const uniqueRanks = new Set(ranks);
    const isTrips = numCards === 3 && uniqueRanks.size === 1;
    const isPair = numCards >= 2 && uniqueRanks.size < numCards;

    if (isTrips) {
        score += 500 * diceValue * learning.tripPreference;
    } else if (isPair) {
        score += 200 * diceValue * learning.tripPreference;
    }

    // 3. Flush
    const suits = validCards.map(c => c.suit);
    const uniqueSuits = new Set(suits);
    const isFlush = uniqueSuits.size === 1 && numCards >= 2;

    if (isFlush) {
        let flushScore = 150 * diceValue * learning.flushPreference;
        if (numCards === 3) flushScore += 150;
        if (isConsecutive && diceValue >= 5) flushScore *= 1.3;
        score += flushScore;
    }

    // 4. Straight
    if (isConsecutive) {
        score += 180 * diceValue * learning.straightPreference * pureMultiplier;
    } else if (isGapConsecutive) {
        score += 80 * diceValue; // Decent setup
    }

    // --- ANTI-SYNERGY PENALTY ---
    // If cards don't match (No Pair, No Flush, No Straight/Gap), and Rank Diff is large -> BAD
    const hasSynergy = isPair || isFlush || isConsecutive || isGapConsecutive;
    if (numCards >= 2 && !hasSynergy) {
        const diff = sortedRanks[sortedRanks.length - 1] - sortedRanks[0];
        if (diff > 4) {
            // e.g. 2 and 10. Very hard to make straight. No pair. No flush.
            score -= 100 * diceValue; // Punish cluttering the column
        } else {
            score -= 20 * diceValue; // Mild penalty for non-matching
        }

        // Punish ruining a high card with a low card
        if (sortedRanks[0] <= 8 && sortedRanks[1] >= 11) {
            score -= 150;
        }
    }

    // Add small bonus for simple high ranks to break 0 ties
    score += avgRank * 2;

    return score;
}

function evaluateXHandPotential(board: (Card | null)[][], newCard: Card, colIndex: number): number {
    // Evaluate bottom row (X-hand) when placing in bottom slot
    const bottomRow = [...board[2]];
    bottomRow[colIndex] = newCard;

    const validCards = bottomRow.filter(c => c !== null) as Card[];
    if (validCards.length < 2) return 0;

    let score = 0;

    // Check for X-hand patterns (for 5 cards)
    const ranks = validCards.map(c => c.rank);

    // Pairs, trips, quads
    const rankCounts = new Map<number, number>();
    ranks.forEach(r => rankCounts.set(r, (rankCounts.get(r) || 0) + 1));
    const maxCount = Math.max(...rankCounts.values());

    if (maxCount >= 2) score += maxCount * 60;

    // Flush potential
    const suits = validCards.map(c => c.suit);
    const uniqueSuits = new Set(suits);
    if (uniqueSuits.size === 1 && validCards.length >= 3) {
        score += 100;
    }

    // Straight potential
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
        if (maxConsecutive >= 3) score += maxConsecutive * 50;
    }

    if (newCard.rank >= 12) score += 80;

    return score;
}

function evaluateOpponentBlock(opponent: GameState['players'][0], colIndex: number): number {
    const oppCol = [opponent.board[0][colIndex], opponent.board[1][colIndex], opponent.board[2][colIndex]];
    const oppCards = oppCol.filter(c => c !== null) as Card[];

    if (oppCards.length < 2) return 0;

    const oppRanks = oppCards.map(c => c.rank);
    const oppSuits = oppCards.map(c => c.suit);

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

    return blockValue;
}

function shouldHideCard(move: { cardId: string, colIndex: number }, hand: Card[], player: GameState['players'][0], board: (Card | null)[][], turnCount: number): boolean {
    if (player.hiddenCardsCount >= 3) return false;

    // CRITICAL FIX: Cannot hide 3rd card in a column if 2 are already hidden
    let hiddenInCol = 0;
    for (let r = 0; r < 3; r++) {
        const card = board[r][move.colIndex];
        if (card && card.isHidden) hiddenInCol++;
    }
    if (hiddenInCol >= 2) return false;

    const card = hand.find(c => c.id === move.cardId);
    if (!card) return false;

    const learning = getLearningData();
    const col = move.colIndex;
    const diceValue = player.dice[col];

    // STRATEGY 4: Early Hidden Card Usage
    // "Use hidden rights early to reduce information"
    const isEarlyGame = turnCount <= 8;
    let baseProb = 0.0;

    // Hide high cards (J, Q, K, A) in high dice columns
    if (card.rank >= 11 && diceValue >= 4) {
        baseProb = 0.4;
    }
    // Strategic hiding for mid-high cards
    else if (card.rank >= 10) {
        baseProb = 0.25;
    }

    // Boost probability in early game
    if (isEarlyGame) {
        baseProb *= 1.5;
    }

    return Math.random() < (baseProb * learning.hidingStrategy / 0.3);
}
