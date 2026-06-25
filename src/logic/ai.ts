import type { GameState, Card, Rank } from './types';
import { getLearningData } from './aiLearning';
import { evaluateYHand } from './evaluation';

// ==========================================
// Level 1, 2, & 3 AI Enhancements
// Features: 
// 1. Heuristics & Bluffing
// 2. Monte Carlo Playouts (EV)
// 3. ExpectiMax (Opponent Lookahead & Blocking)
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
    let myScore = player.score || 0;
    let oppScore = opponent.score || 0;
    const isLosingBadly = (oppScore - myScore) > 15;
    
    const avgDice = dice.reduce((a, b) => a + b, 0) / 5;
    const isHighStakes = avgDice >= 3.5;

    let bestMove = { cardId: hand[0].id, colIndex: validColumns[0], isHidden: false };
    let bestScore = -Infinity;

    const learning = getLearningData();

    // 4. LEVEL 3: ExpectiMax Loop
    for (const card of hand) {
        for (const col of validColumns) {
            // Calculate our EV for this move
            let myScoreEV = evaluateMoveEV(player, opponent, card, col, remainingDeck, isLosingBadly, isHighStakes);
            if (myScoreEV === -Infinity) continue;

            // ==========================================
            // LEVEL 3: Opponent Lookahead
            // ==========================================
            // Hypothetically apply our move
            const hypotheticalBoard = [
                [...player.board[0]],
                [...player.board[1]],
                [...player.board[2]]
            ];
            const emptySlotIdx = hypotheticalBoard.findIndex((_, r) => hypotheticalBoard[r][col] === null);
            if (emptySlotIdx !== -1) {
                hypotheticalBoard[emptySlotIdx][col] = card;
            }
            
            const hypotheticalPlayer = { ...player, board: hypotheticalBoard };
            
            // Find opponent's best response EV
            let bestOpponentResponseEV = 0;
            const oppValidColumns = [];
            for (let c = 0; c < 5; c++) {
                if (opponent.board[2][c] === null) oppValidColumns.push(c);
            }
            
            if (oppValidColumns.length > 0 && opponent.hand.length > 0) {
                let maxOppEV = -Infinity;
                for (const oppCard of opponent.hand) {
                    for (const oppCol of oppValidColumns) {
                        // The opponent evaluates their move against our hypothetical new board
                        let oppEV = evaluateMoveEV(opponent, hypotheticalPlayer, oppCard, oppCol, remainingDeck, !isLosingBadly, isHighStakes);
                        if (oppEV > maxOppEV) maxOppEV = oppEV;
                    }
                }
                bestOpponentResponseEV = maxOppEV === -Infinity ? 0 : maxOppEV;
            }

            // Net Score: Maximize our EV while minimizing opponent's Best EV
            // The defensiveAwareness weight dictates how much we prioritize blocking
            const netScore = myScoreEV - (bestOpponentResponseEV * (learning.defensiveAwareness || 0.8));

            if (netScore > bestScore) {
                bestScore = netScore;
                bestMove = { cardId: card.id, colIndex: col, isHidden: false };
            }
        }
    }

    // LEVEL 1: Strategic Bluffing
    bestMove.isHidden = shouldHideCard(bestMove, hand, player, board, gameState.turnCount, opponent);

    return bestMove;
}

/**
 * Calculates the Expected Value of placing a specific card in a specific column.
 */
function evaluateMoveEV(
    actor: GameState['players'][0],
    adversary: GameState['players'][0],
    card: Card,
    colIndex: number,
    remainingDeck: Card[],
    isLosingBadly: boolean,
    isHighStakes: boolean
): number {
    const board = actor.board;
    const dice = actor.dice;
    
    const currentCards = [board[0][colIndex], board[1][colIndex], board[2][colIndex]];
    const emptySlotIdx = currentCards.findIndex(c => c === null);
    if (emptySlotIdx === -1) return -Infinity;

    const potentialCards = [...currentCards];
    potentialCards[emptySlotIdx] = card;
    
    // Level 2: Monte Carlo Expected Value
    let mcScore = runMonteCarloPlayouts(
        potentialCards, 
        dice[colIndex], 
        remainingDeck, 
        MONTE_CARLO_ITERATIONS,
        isLosingBadly
    );

    // Level 1: Heuristics & Context
    
    // Resource Allocation (Alignment Bonus)
    const colDice = dice[colIndex];
    const alignmentBonus = (card.rank - 8) * (colDice - 3.5) * 100;
    mcScore += alignmentBonus;
    
    // X-hand (bottom row) strategy
    if (emptySlotIdx === 2) {
        const learning = getLearningData();
        const xScore = evaluateXHandPotential(board, card, colIndex) * learning.xHandFocus;
        mcScore += xScore * (isHighStakes ? 0.8 : 1.2);
    }

    // Opponent blocking logic natively handled by Level 3 ExpectiMax
    // But we keep a lightweight heuristic bonus for creating strong standalone blocks
    mcScore += evaluateOpponentBlock(adversary, colIndex);

    // Spread Bonus
    if (emptySlotIdx === 0) {
        mcScore += 50; 
    }

    mcScore += Math.random() * 10;
    return mcScore;
}

function runMonteCarloPlayouts(
    currentCol: (Card | null)[], 
    diceValue: number, 
    remainingDeck: Card[], 
    iterations: number,
    isLosingBadly: boolean
): number {
    let totalScore = 0;
    const learning = getLearningData();

    const missingCount = currentCol.filter(c => c === null).length;

    if (missingCount === 0) {
        return calculateHandValue(currentCol as Card[], diceValue, learning, isLosingBadly);
    }

    if (remainingDeck.length < missingCount) return 0;

    for (let i = 0; i < iterations; i++) {
        const drawnCards = getRandomSample(remainingDeck, missingCount);
        let drawIndex = 0;
        const simulatedCol = currentCol.map(c => c === null ? drawnCards[drawIndex++] : c);
        
        totalScore += calculateHandValue(simulatedCol as Card[], diceValue, learning, isLosingBadly);
    }

    return totalScore / iterations;
}

function calculateHandValue(cards: Card[], diceValue: number, learning: any, isLosingBadly: boolean): number {
    const result = evaluateYHand(cards, diceValue);
    
    let baseValue = Math.pow(result.rankValue, 2) * 10 * diceValue;
    
    if (result.type.includes('Flush')) baseValue *= learning.flushPreference;
    if (result.type.includes('Straight')) baseValue *= learning.straightPreference;
    if (result.type.includes('Pair') || result.type.includes('Trips')) baseValue *= learning.tripPreference;

    if (isLosingBadly && result.rankValue >= 5) {
        baseValue *= 1.5; 
    }

    return baseValue;
}

// --- Utility Functions ---

function getVisibleCards(player: GameState['players'][0], opponent: GameState['players'][0]): Card[] {
    const visible: Card[] = [];
    
    visible.push(...player.hand);
    
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) {
            if (player.board[r][c]) visible.push(player.board[r][c]!);
        }
    }
    
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

    const rankCounts = new Map<number, number>();
    ranks.forEach(r => rankCounts.set(r, (rankCounts.get(r) || 0) + 1));
    const maxCount = Math.max(...rankCounts.values());

    if (maxCount >= 2) score += Math.pow(maxCount, 2) * 20;

    const suits = validCards.map(c => c.suit);
    const uniqueSuits = new Set(suits);
    if (uniqueSuits.size === 1 && validCards.length >= 3) {
        score += 150;
    }

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

    if (card.rank <= 6 && myDice >= 4) {
        baseProb = 0.35;
    }
    
    if (card.rank >= 11 && oppDice >= 4) {
        baseProb = 0.4;
    }

    const emptySlotIdx = [board[0][col], board[1][col], board[2][col]].findIndex(c => c === null);
    if (emptySlotIdx === 2) {
        baseProb += 0.2;
    }

    if (turnCount <= 8) {
        baseProb *= 1.5;
    }

    return Math.random() < (baseProb * learning.hidingStrategy / 0.3);
}
