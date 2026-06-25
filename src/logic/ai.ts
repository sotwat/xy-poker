import type { GameState, Card, Rank } from './types';
import { getLearningData } from './aiLearning';
import { evaluateYHand } from './evaluation';

// ==========================================
// Level 1 & Level 2 AI Enhancements
// Features: Monte Carlo Tree Search (MCTS / Playouts), Dynamic Risk Management, Strategic Bluffing.
// ==========================================

const MONTE_CARLO_ITERATIONS = 30; // Lightweight to avoid blocking UI

export function getBestMove(gameState: GameState, playerIndex: number): { cardId: string, colIndex: number, isHidden: boolean } {
    const player = gameState.players[playerIndex];
    const opponent = gameState.players[playerIndex === 0 ? 1 : 0];
    const hand = player.hand;
    const board = player.board;
    const dice = player.dice;

    // 1. Identify valid columns
    const validColumns: number[] = [];
    for (let c = 0; c < 5; c++) {
        if (board[2][c] === null) {
            validColumns.push(c);
        }
    }

    if (validColumns.length === 0) {
        return { cardId: hand[0]?.id || '', colIndex: 0, isHidden: false };
    }
    
    validColumns.sort(() => Math.random() - 0.5);

    // 2. Extract known cards to build the remaining deck for Monte Carlo
    const visibleCards = getVisibleCards(player, opponent);
    const remainingDeck = getRemainingDeck(visibleCards);

    // 3. Dynamic Risk Assessment
    // Calculate current points to decide if we need to take high risks
    let myScore = player.score || 0;
    let oppScore = opponent.score || 0;
    const isLosingBadly = (oppScore - myScore) > 15;
    
    // Dice context
    const avgDice = dice.reduce((a, b) => a + b, 0) / 5;
    const isHighStakes = avgDice >= 3.5;

    let bestMove = { cardId: hand[0].id, colIndex: validColumns[0], isHidden: false };
    let bestScore = -Infinity;

    for (const card of hand) {
        for (const col of validColumns) {
            const currentCards = [board[0][col], board[1][col], board[2][col]];
            const emptySlotIdx = currentCards.findIndex(c => c === null);
            if (emptySlotIdx === -1) continue;

            const potentialCards = [...currentCards];
            potentialCards[emptySlotIdx] = card;
            
            // ==========================================
            // LEVEL 2: Monte Carlo Expected Value (EV)
            // ==========================================
            let mcScore = runMonteCarloPlayouts(
                potentialCards, 
                dice[col], 
                remainingDeck, 
                MONTE_CARLO_ITERATIONS,
                isLosingBadly
            );

            // ==========================================
            // LEVEL 1: Advanced Heuristics & Context
            // ==========================================
            
            // Strategic Resource Allocation (Alignment Bonus)
            // Force the AI to "give up" on low-dice columns by heavily penalizing 
            // the placement of High Cards in Low Dice columns, and vice versa.
            // Reward: High Card in High Column OR Low Card in Low Column.
            const colDice = dice[col];
            const alignmentBonus = (card.rank - 8) * (colDice - 3.5) * 100;
            mcScore += alignmentBonus;
            
            // X-hand (bottom row) strategy
            if (emptySlotIdx === 2) {
                const learning = getLearningData();
                const xScore = evaluateXHandPotential(board, card, col) * learning.xHandFocus;
                mcScore += xScore * (isHighStakes ? 0.8 : 1.2);
            }

            // Opponent blocking strategy
            mcScore += evaluateOpponentBlock(opponent, col);

            // Spread Bonus to avoid stacking everything in one column early on
            if (emptySlotIdx === 0) {
                mcScore += 50; 
            }

            // Small randomness for variety
            mcScore += Math.random() * 10;

            if (mcScore > bestScore) {
                bestScore = mcScore;
                bestMove = { cardId: card.id, colIndex: col, isHidden: false };
            }
        }
    }

    // ==========================================
    // LEVEL 1: Strategic Bluffing (Face Down)
    // ==========================================
    bestMove.isHidden = shouldHideCard(bestMove, hand, player, board, gameState.turnCount, opponent);

    return bestMove;
}

/**
 * Runs N random playouts to calculate the Expected Value of a column.
 */
function runMonteCarloPlayouts(
    currentCol: (Card | null)[], 
    diceValue: number, 
    remainingDeck: Card[], 
    iterations: number,
    isLosingBadly: boolean
): number {
    let totalScore = 0;
    const learning = getLearningData();

    // How many cards do we need to draw to finish the column?
    const missingCount = currentCol.filter(c => c === null).length;

    if (missingCount === 0) {
        // Column already full, evaluate exact score
        return calculateHandValue(currentCol as Card[], diceValue, learning, isLosingBadly);
    }

    // If deck is smaller than what we need, adjust (shouldn't happen normally)
    if (remainingDeck.length < missingCount) return 0;

    for (let i = 0; i < iterations; i++) {
        // Fast random sample without full shuffle
        const drawnCards = getRandomSample(remainingDeck, missingCount);
        
        let drawIndex = 0;
        const simulatedCol = currentCol.map(c => c === null ? drawnCards[drawIndex++] : c);
        
        totalScore += calculateHandValue(simulatedCol as Card[], diceValue, learning, isLosingBadly);
    }

    return totalScore / iterations;
}

/**
 * Maps a Y-Hand to a heuristic EV score.
 */
function calculateHandValue(cards: Card[], diceValue: number, learning: any, isLosingBadly: boolean): number {
    const result = evaluateYHand(cards, diceValue);
    
    // Map rankValue (1-9) to an exponential scale so High hands are heavily favored
    let baseValue = Math.pow(result.rankValue, 2) * 10 * diceValue;
    
    // Apply learning weights
    if (result.type.includes('Flush')) baseValue *= learning.flushPreference;
    if (result.type.includes('Straight')) baseValue *= learning.straightPreference;
    if (result.type.includes('Pair') || result.type.includes('Trips')) baseValue *= learning.tripPreference;

    // Dynamic Risk: If losing badly, dramatically reward high variance hands (Flush, Straight)
    if (isLosingBadly && result.rankValue >= 5) {
        baseValue *= 1.5; 
    }

    return baseValue;
}

// --- Utility Functions for Level 1 & 2 ---

function getVisibleCards(player: GameState['players'][0], opponent: GameState['players'][0]): Card[] {
    const visible: Card[] = [];
    
    // Player's hand
    visible.push(...player.hand);
    
    // Player's board
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) {
            if (player.board[r][c]) visible.push(player.board[r][c]!);
        }
    }
    
    // Opponent's visible board (skip hidden cards)
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) {
            const oppCard = opponent.board[r][c];
            if (oppCard && !oppCard.isHidden) visible.push(oppCard);
        }
    }
    
    return visible;
}

function getRemainingDeck(visibleCards: Card[]): Card[] {
    const suits: Card['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const fullDeck: Card[] = [];
    
    for (const suit of suits) {
        for (const rank of ranks) {
            fullDeck.push({ id: `${rank}${suit}`, suit, rank, isHidden: false });
        }
    }
    
    const visibleIds = new Set(visibleCards.map(c => c.id));
    return fullDeck.filter(c => !visibleIds.has(c.id));
}

function getRandomSample<T>(arr: T[], n: number): T[] {
    const result = new Array(n);
    let len = arr.length;
    const taken = new Array(len);
    while (n--) {
        const x = Math.floor(Math.random() * len);
        result[n] = arr[x in taken ? taken[x] : x];
        taken[x] = --len in taken ? taken[len] : len;
    }
    return result;
}

function evaluateXHandPotential(board: (Card | null)[][], newCard: Card, colIndex: number): number {
    const bottomRow = [...board[2]];
    bottomRow[colIndex] = newCard;

    const validCards = bottomRow.filter(c => c !== null) as Card[];
    if (validCards.length < 2) return 0;

    let score = 0;
    const ranks = validCards.map(c => c.rank);

    // Pairs, trips, quads
    const rankCounts = new Map<number, number>();
    ranks.forEach(r => rankCounts.set(r, (rankCounts.get(r) || 0) + 1));
    const maxCount = Math.max(...rankCounts.values());

    if (maxCount >= 2) score += Math.pow(maxCount, 2) * 20;

    // Flush potential
    const suits = validCards.map(c => c.suit);
    const uniqueSuits = new Set(suits);
    if (uniqueSuits.size === 1 && validCards.length >= 3) {
        score += 150;
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
        if (maxConsecutive >= 3) score += maxConsecutive * 40;
    }

    if (newCard.rank >= 12) score += 30;

    return score;
}

function evaluateOpponentBlock(opponent: GameState['players'][0], colIndex: number): number {
    const oppCol = [opponent.board[0][colIndex], opponent.board[1][colIndex], opponent.board[2][colIndex]];
    const oppCards = oppCol.filter(c => c !== null) as Card[];

    if (oppCards.length < 2) return 0;

    const oppRanks = oppCards.map(c => c.rank);
    const oppSuits = oppCards.map(c => c.suit);
    let blockValue = 0;

    const uniqueOppRanks = new Set(oppRanks);
    if (uniqueOppRanks.size === 1) blockValue += 50; 
    
    const uniqueOppSuits = new Set(oppSuits);
    if (uniqueOppSuits.size === 1 && oppCards.length >= 2) blockValue += 40;

    return blockValue;
}

function shouldHideCard(
    move: { cardId: string, colIndex: number }, 
    hand: Card[], 
    player: GameState['players'][0], 
    board: (Card | null)[][], 
    turnCount: number,
    opponent: GameState['players'][0]
): boolean {
    if (player.hiddenCardsCount >= 3) return false;

    // Cannot hide 3rd card in a column if 2 are already hidden
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
    const myDice = player.dice[col];
    const oppDice = opponent.dice[col];

    let baseProb = 0.0;

    // Strategic Bluffing: Hide low cards in high-dice columns to fake strength
    if (card.rank <= 6 && myDice >= 4) {
        baseProb = 0.35;
    }
    
    // Hide high cards in opponent's high-dice columns to make them hesitate
    if (card.rank >= 11 && oppDice >= 4) {
        baseProb = 0.4;
    }

    // Hide X-Hand potential cards (bottom row)
    const emptySlotIdx = [board[0][col], board[1][col], board[2][col]].findIndex(c => c === null);
    if (emptySlotIdx === 2) {
        baseProb += 0.2;
    }

    // Boost probability in early game
    if (turnCount <= 8) {
        baseProb *= 1.5;
    }

    return Math.random() < (baseProb * learning.hidingStrategy / 0.3);
}
