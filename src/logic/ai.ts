import type { GameState, Card, Rank } from './types';
import { getLearningData } from './aiLearning';
import { evaluateYHand } from './evaluation';

export interface AiParams {
    pureStraightFlushBonus: number;
    pureStraightBonus: number;
    flushBonus: number;
    pairPenalty: number;
    tripsInHandBonus: number;
    pairInHandBonus: number;
    lowCardPenalty: number;
    queenFirstRowBonus: number;
    xHandBaseMultiplier: number;
    trashBinRushBase: number;
    trashBinRushMultiplier: number;
    drawValueBase: number;
    showdownDelayPenalty: number;
    row3DelayPenalty: number;
    bluffBonus: number;
    mcSimulations: number;
    // --- Turn Selection Params ---
    turnOrderBaseFirstValue: number;
    turnOrderPairBonus: number;
    turnOrderHighCardBonus: number;
}

export const DEFAULT_AI_PARAMS: AiParams = {
    pureStraightFlushBonus: 800,
    pureStraightBonus: 600,
    flushBonus: 50,
    pairPenalty: -300,
    tripsInHandBonus: 1000,
    pairInHandBonus: 200,
    lowCardPenalty: -400,
    queenFirstRowBonus: 200,
    xHandBaseMultiplier: 30,
    trashBinRushBase: 50,
    trashBinRushMultiplier: 10,
    drawValueBase: 200,
    showdownDelayPenalty: 500,
    row3DelayPenalty: 200,
    bluffBonus: 150,
    mcSimulations: 30, // Level 2 default
    turnOrderBaseFirstValue: 0,
    turnOrderPairBonus: 200,
    turnOrderHighCardBonus: 50
};

// ==========================================
// Level 1, 2, & 3 AI Enhancements
// Features: 
// 1. Heuristics & Bluffing
// 2. Monte Carlo Playouts (EV)
// 3. ExpectiMax (Opponent Lookahead & Blocking)
// ==========================================


export function getBestTurnOrder(
    gameState: GameState,
    playerIndex: number,
    params: AiParams = DEFAULT_AI_PARAMS
): boolean {
    const player = gameState.players[playerIndex];
    const hand = player.hand;

    // Evaluate heuristics
    let hasPair = false;
    let highCardsCount = 0;

    for (let i = 0; i < hand.length; i++) {
        if (hand[i].rank >= 10) highCardsCount++;
        for (let j = i + 1; j < hand.length; j++) {
            if (hand[i].rank === hand[j].rank) hasPair = true;
        }
    }

    let score = params.turnOrderBaseFirstValue;
    if (hasPair) score += params.turnOrderPairBonus;
    if (highCardsCount >= 2) score += params.turnOrderHighCardBonus;

    // Return true if score > 0 (go first), false if score <= 0 (go second)
    return score > 0;
}

export function getBestMove(
    gameState: GameState,
    playerIndex: number,
    params: AiParams = DEFAULT_AI_PARAMS
): { cardId: string; colIndex: number; isHidden: boolean } {
    const player = gameState.players[playerIndex];
    const opponent = gameState.players[1 - playerIndex];
    const hand = player.hand;
    const board = player.board;

    if (hand.length === 0) return { cardId: '', colIndex: 0, isHidden: false };

    const validColumns = [];
    for (let c = 0; c < 5; c++) {
        if (board[2][c] === null) validColumns.push(c);
    }

    if (validColumns.length === 0) return { cardId: hand[0].id, colIndex: 0, isHidden: false };

    // 2. Extract known cards to build the remaining deck for Monte Carlo
    const visibleCards = getVisibleCards(player, opponent);
    const remainingDeck = getRemainingDeck(visibleCards);

    // Calculate score difference to determine if we are losing badly
    let myScore = player.score;
    let oppScore = opponent.score;
    for (let c = 0; c < 5; c++) {
        if (board[2][c] !== null && opponent.board[2][c] !== null) {
             const myEV = runMonteCarloPlayouts([board[0][c], board[1][c], board[2][c]], [opponent.board[0][c], opponent.board[1][c], opponent.board[2][c]], player.dice[c], remainingDeck, 1, false);
             if (myEV > 0) myScore += player.dice[c];
             else if (myEV < 0) oppScore += player.dice[c];
        }
    }
    const isLosingBadly = (oppScore - myScore) > 15;
    

    let bestMove = { cardId: hand[0].id, colIndex: validColumns[0], isHidden: false };
    let bestScore = -Infinity;

    const learning = getLearningData();

    // 4. LEVEL 3: ExpectiMax Loop
    for (const card of hand) {
        for (const col of validColumns) {
            // Calculate our EV for this move
            let myScoreEV = evaluateMoveEV(player, opponent, card, col, remainingDeck, isLosingBadly, gameState.turnCount, params);
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
                        let oppEV = evaluateMoveEV(opponent, hypotheticalPlayer, oppCard, oppCol, remainingDeck, !isLosingBadly, gameState.turnCount, params);
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
    bestMove.isHidden = shouldHideCard(bestMove, hand, player, board, gameState.turnCount, opponent, params);

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
    turnCount: number,
    params: AiParams
): number {
    const board = actor.board;
    const dice = actor.dice;
    
    const currentCards = [board[0][colIndex], board[1][colIndex], board[2][colIndex]];
    const emptySlotIdx = currentCards.findIndex(c => c === null);
    if (emptySlotIdx === -1) return -Infinity;

    const potentialCards = [...currentCards];
    potentialCards[emptySlotIdx] = card;

    const oppColCards = [adversary.board[0][colIndex], adversary.board[1][colIndex], adversary.board[2][colIndex]];
    
    // Level 2 & 3: Adversarial Monte Carlo Expected Value
    // By simulating both our hand and the opponent's hand, we mathematically detect "dead columns" (guaranteed losses).
    // If we can't beat the opponent's current/future hand, the Y-EV drops to 0, forcing the AI to treat it as a trash bin.
    let mcScore = runMonteCarloPlayouts(
        potentialCards, 
        oppColCards,
        dice[colIndex], 
        remainingDeck, 
        params.mcSimulations,
        isLosingBadly
    );

    // Level 1: Heuristics & Context
    
    // Resource Allocation (Alignment Bonus)
    // We softly encourage high cards in high-dice columns and low cards in low-dice columns.
    const colDice = dice[colIndex];
    let alignmentBonus = (card.rank - 8) * (colDice - 3.5) * 50; // Reduced base weight to allow synergy to shine
    
    // Check if the card synergizes with existing cards in the column (Pair, Flush, Straight potential)
    const existingCardsInCol = [board[0][colIndex], board[1][colIndex]].filter(c => c !== null) as Card[];
    if (existingCardsInCol.length > 0) {
        const isPair = existingCardsInCol.some(c => c.rank === card.rank);
        const isSuitMatch = existingCardsInCol.some(c => c.suit === card.suit);
        const isConsecutive = existingCardsInCol.some(c => Math.abs(c.rank - card.rank) <= 2 && Math.abs(c.rank - card.rank) > 0);
        
        // Pure Straight Supremacy (Strategy Section 11)
        // If this is a high-value column (dice >= 4), Pure One Pair is practically a losing hand.
        if (colDice >= 4) {
            if (isPair) {
                // Penalize settling for a pair in a crucial column! We need Straights/Flushes to win.
                alignmentBonus += params.pairPenalty * colDice; 
            }
            if (isConsecutive && isSuitMatch) {
                // Massive bonus for Pure Straight Flush potential
                alignmentBonus += params.pureStraightFlushBonus * colDice;
            } else if (isConsecutive) {
                // Bonus for Pure Straight potential (Pure Straight is the winning standard)
                alignmentBonus += params.pureStraightBonus * colDice;
            } else if (isSuitMatch) {
                // Flush is weaker than expected. Minimal bonus, so it strongly prefers Pure Straights.
                alignmentBonus += params.flushBonus * colDice;
            }
        } else {
            // If there's synergy in a low-value column, neutralize negative alignment penalty
            if (alignmentBonus < 0 && (isPair || isSuitMatch || isConsecutive)) {
                alignmentBonus = 0; 
            }
        }
    }
    mcScore += alignmentBonus;
    
    // X-hand (bottom row) strategy
    // The value of the X-hand scales INVERSELY with the total dice points.
    // If total dice is low (e.g. 5), X-hand is worth more than all columns combined.
    // If total dice is high (e.g. 30), X-hand is just a small bonus.
    if (emptySlotIdx === 2) {
        const totalDice = dice.reduce((a, b) => a + b, 0);
        // Inverse scaling: max multiplier at dice=5, min at dice=30
        const xHandMultiplier = params.xHandBaseMultiplier / Math.max(5, totalDice);
        
        const learning = getLearningData();
        const xScore = evaluateXHandPotential(board, card, colIndex) * learning.xHandFocus;
        mcScore += xScore * xHandMultiplier;
    }

    // Opponent blocking logic natively handled by Level 3 ExpectiMax
    // But we keep a lightweight heuristic bonus for creating strong standalone blocks
    mcScore += evaluateOpponentBlock(adversary, colIndex);

    // Draw Rush Bonus (Trash Bin Strategy)
    // The first player to fill a column draws an extra card.
    // The AI actively uses low-dice columns as "trash bins" to quickly dump weak cards and get this bonus.
    let rushMultiplier = 1;
    const oppColFull = adversary.board[2][colIndex] !== null;
    if (!oppColFull) {
        if (dice[colIndex] <= 2) {
            // Inverse scaling: Trash bins are more valuable early game
            rushMultiplier = (15 - turnCount) / params.trashBinRushMultiplier; 
            if (emptySlotIdx === 0) {
                mcScore += params.trashBinRushBase * rushMultiplier;  // Up to +300 EV for starting a trash bin
            }
        }
    }

    // Edge Card 1st-Row Penalty & Hand Synergy
    if (emptySlotIdx === 0) {
        const matchingInHand = actor.hand.filter(c => c.rank === card.rank).length;
        if (matchingInHand >= 3) {
            // Guaranteed Trips in hand! This is the ultimate weapon.
            // Heavily reward placing it, scaling with dice value so it targets the highest column.
            mcScore += params.tripsInHandBonus * dice[colIndex]; 
        } else if (matchingInHand >= 2) {
            // Guaranteed Pair in hand. Good, but not as strong as trips.
            mcScore += params.pairInHandBonus * dice[colIndex];
        } else {
            // Isolated card check. Are there other cards in hand that form a straight/flush?
            const hasStraightSynergyInHand = actor.hand.some(c => c !== card && Math.abs(c.rank - card.rank) <= 2 && Math.abs(c.rank - card.rank) > 0);
            const hasFlushSynergyInHand = actor.hand.filter(c => c.suit === card.suit).length >= 3; // 3 of same suit in hand is strong flush potential

            // Edge card penalty
            if (card.rank === 14 || card.rank === 13 || card.rank === 2) {
                // Only penalize if it's TRULY isolated (no pairs, no straight/flush connectors in hand)
                if (!hasStraightSynergyInHand && !hasFlushSynergyInHand) {
                    mcScore += params.lowCardPenalty; 
                }
            } else if (card.rank === 12) {
                // The Queen (12) is the mathematical best card to start a column.
                // Maximum straight flexibility (3 patterns) + extremely high base rank value.
                mcScore += params.queenFirstRowBonus;
            }
        }
    }

    // --- Dynamic Draw Bonus & Tactic Integration ---
    if (emptySlotIdx === 2) {
        // Dynamic value of getting a +1 Draw (2-draw turn)
        let drawValue = params.drawValueBase; // Base value of drawing an extra card
        
        // 1. Hand size: Fewer cards = higher value.
        if (actor.hand.length <= 2) drawValue += 350; // Desperate for options
        else if (actor.hand.length >= 5) drawValue -= 150; // Already have plenty
        
        // 2. Turn count: Early game = building arsenal.
        if (turnCount <= 6) drawValue += 200;
        else if (turnCount >= 12) drawValue -= 200;

        mcScore += drawValue;
        
        // Trash Bin Synergy: If it's a low dice column, the primary goal IS the draw.
        if (dice[colIndex] <= 2) {
            mcScore += 200 * rushMultiplier;
        }

        // Tactic 2: Showdown Delay (決着の遅延)
        // If we are likely winning a high-dice column, delay completion to milk opponent resources.
        if (dice[colIndex] >= 4 && turnCount <= 11) {
            const oppColFull = oppColCards.every(c => c !== null);
            if (!oppColFull && mcScore > 500) {
                mcScore -= params.showdownDelayPenalty; // Delay penalty (can be offset if drawValue is massively high)
            }
        }

        // Tactic 3: 3rd Row Intersection Priority (交差点の特異点)
        // Row 2 is the X-Hand component. Locking it early restricts X-hand flexibility.
        if (dice[colIndex] >= 3 && turnCount <= 8) {
            mcScore -= params.row3DelayPenalty; // Flexibility penalty (can be offset if drawValue is massively high)
        }
    }

    mcScore += Math.random() * 10;
    return mcScore;
}

function runMonteCarloPlayouts(
    myCol: (Card | null)[], 
    oppCol: (Card | null)[],
    diceValue: number, 
    remainingDeck: Card[], 
    iterations: number,
    isLosingBadly: boolean
): number {
    let totalScore = 0;
    const learning = getLearningData();

    const myMissing = myCol.filter(c => c === null).length;
    const oppMissing = oppCol.filter(c => c === null).length;

    if (remainingDeck.length < myMissing + oppMissing) return 0;

    for (let i = 0; i < iterations; i++) {
        const drawnCards = getRandomSample(remainingDeck, myMissing + oppMissing);
        let drawIndex = 0;
        
        const mySimulatedCol = myCol.map(c => c === null ? drawnCards[drawIndex++] : c) as Card[];
        const oppSimulatedCol = oppCol.map(c => c === null ? drawnCards[drawIndex++] : c) as Card[];
        
        const myRes = evaluateYHand(mySimulatedCol, diceValue);
        const oppRes = evaluateYHand(oppSimulatedCol, diceValue);
        
        let weWin = false;
        if (myRes.rankValue > oppRes.rankValue) {
            weWin = true;
        } else if (myRes.rankValue === oppRes.rankValue) {
            for (let k = 0; k < Math.max(myRes.kickers.length, oppRes.kickers.length); k++) {
                const mk = myRes.kickers[k] || 0;
                const ok = oppRes.kickers[k] || 0;
                if (mk > ok) { weWin = true; break; }
                if (ok > mk) { break; }
            }
        }

        // If we win the column, add the heuristic EV.
        // If we lose (or tie and lose kickers), the Y-hand EV is 0! This instantly detects "dead columns".
        if (weWin) {
            totalScore += calculateHandValue(mySimulatedCol, diceValue, learning, isLosingBadly);
        }
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
    opponent: GameState['players'][0],
    params: AiParams
): boolean {
    if (player.hiddenCardsCount >= 3) return false;

    let hiddenInCol = 0;
    for (let r = 0; r < 3; r++) {
        const c = board[r][move.colIndex];
        if (c && c.isHidden) hiddenInCol++;
    }
    if (hiddenInCol >= 2) return false;

    const card = hand.find(c => c.id === move.cardId);
    if (!card) return false;

    const learning = getLearningData();
    const col = move.colIndex;
    
    // Rule 2: Ineffective on completed opponent columns
    const oppColFull = opponent.board[2][col] !== null;
    if (oppColFull) return false; // Pointless to bluff a column the opponent has finished

    let baseProb = 0.05;

    // Rule 1: Early placement is better (obscures intent longer)
    const emptySlotIdx = [board[0][col], board[1][col], board[2][col]].findIndex(c => c === null);
    if (emptySlotIdx === 0) baseProb += 0.4;
    else if (emptySlotIdx === 1) baseProb += 0.2;
    else if (emptySlotIdx === 2) {
        // Special case: If we are placing the 3rd card of a guaranteed Trips (Three of a Kind),
        // hiding it is extremely effective because it baits the opponent into thinking we only have a pair.
        const c0 = board[0][col];
        const c1 = board[1][col];
        if (c0 && c1 && c0.rank === c1.rank && c0.rank === card.rank) {
            baseProb += 0.8; // Massive chance to hide the deadly 3rd card of Trips
        }
    }
    
    if (turnCount <= 6) baseProb += 0.2;

    // Fake strength / Intimidation
    const myDice = player.dice[col];
    const oppDice = opponent.dice[col];
    if (card.rank <= 6 && myDice >= 4) baseProb += 0.3;
    if (card.rank >= 11 && oppDice >= 4) baseProb += 0.3;

    // Rule 3 & 4: Denying Outs (The psychological trap)
    // If the opponent is waiting for this exact card, hide it so they don't know it's dead.
    let isDenyingOut = false;
    for (let c = 0; c < 5; c++) {
        const oppCards = [opponent.board[0][c], opponent.board[1][c], opponent.board[2][c]].filter(x => x !== null) as Card[];
        if (oppCards.length === 2) {
            const r1 = oppCards[0].rank;
            const r2 = oppCards[1].rank;
            const s1 = oppCards[0].suit;
            const s2 = oppCards[1].suit;

            // Denying a Flush draw
            if (s1 === s2 && card.suit === s1) isDenyingOut = true;
            
            // Denying a Straight draw
            const minR = Math.min(r1, r2);
            const maxR = Math.max(r1, r2);
            if (maxR - minR <= 3 && card.rank >= minR - 2 && card.rank <= maxR + 2) isDenyingOut = true;

            // Denying Pair/Trips
            if (card.rank === r1 || card.rank === r2) isDenyingOut = true;
        }
    }

    if (isDenyingOut) {
        baseProb += 0.6; // Highly likely to hide if it burns an opponent's out
    }

    // Apply bluff multiplier from params
    baseProb *= (params.bluffBonus / 150);

    return Math.random() < (baseProb * learning.hidingStrategy / 0.3);
}
