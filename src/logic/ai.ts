import type { GameState, Card, Rank, YHandResult } from './types';
import { getLearningData } from './aiLearning';
import { evaluateYHand, evaluateXHand } from './evaluation';

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
    pureStraightFlushBonus: 57,
    pureStraightBonus: 2,
    flushBonus: 14,
    pairPenalty: -2,
    tripsInHandBonus: 99,
    pairInHandBonus: 12,
    lowCardPenalty: -2,
    queenFirstRowBonus: 2,
    xHandBaseMultiplier: 2,
    trashBinRushBase: 2,
    trashBinRushMultiplier: 2,
    drawValueBase: 32,
    showdownDelayPenalty: 10,
    row3DelayPenalty: 131,
    bluffBonus: 2,
    mcSimulations: 20,
    turnOrderBaseFirstValue: 0,
    turnOrderPairBonus: 2,
    turnOrderHighCardBonus: 2
};

// ==========================================
// Collaborative Learning Overrides
// ==========================================
let activeGlobalParams: any = null;

export function setGlobalAiParams(params: any): void {
    console.log('[AI Engine] Hydrating decision engine with Global Collaborative AI weights:', params);
    activeGlobalParams = params;
}

function getActiveLearningData(): any {
    const localLearning = getLearningData();
    if (!activeGlobalParams) {
        return localLearning;
    }
    // Map database snake_case parameters to game's camelCase variables
    return {
        ...localLearning,
        tripPreference: activeGlobalParams.trip_preference ?? localLearning.tripPreference,
        flushPreference: activeGlobalParams.flush_preference ?? localLearning.flushPreference,
        straightPreference: activeGlobalParams.straight_preference ?? localLearning.straightPreference,
        xHandFocus: activeGlobalParams.x_hand_focus ?? localLearning.xHandFocus,
        bonusAggression: activeGlobalParams.bonus_aggression ?? localLearning.bonusAggression,
        defensiveAwareness: activeGlobalParams.defensive_awareness ?? localLearning.defensiveAwareness
    };
}

// ==========================================
// Cache & Transposition System for Deep Search
// ==========================================
const evCache = new Map<string, number>();

function getBoardHash(player: GameState['players'][0], opponent: GameState['players'][0]): string {
    const getCardsStr = (board: (Card | null)[][]) => {
        return board.map(row => row.map(c => c ? c.id + (c.isHidden ? 'H' : 'V') : 'E').join(',')).join('|');
    };
    return getCardsStr(player.board) + '||' + getCardsStr(opponent.board);
}

function getHandHash(hand: Card[]): string {
    return hand.map(c => c.id).sort().join(',');
}

// ==========================================
// Turn Order & Main Move Decisions
// ==========================================
export function getBestTurnOrder(
    gameState: GameState,
    playerIndex: number,
    params: AiParams = DEFAULT_AI_PARAMS
): boolean {
    const player = gameState.players[playerIndex];
    const hand = player.hand;

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

    return score > 0;
}

export function getBestMove(
    gameState: GameState,
    playerIndex: number,
    params: AiParams = DEFAULT_AI_PARAMS
): { cardId: string; colIndex: number; isHidden: boolean } {
    const startTime = Date.now();
    const TIMEOUT_MS = 150; // Strict 150ms budget for thinking to prevent browser lag

    const player = gameState.players[playerIndex];
    const opponent = gameState.players[1 - playerIndex];
    const hand = player.hand;

    if (hand.length === 0) return { cardId: '', colIndex: 0, isHidden: false };

    const validColumns = [];
    for (let c = 0; c < 5; c++) {
        if (player.board[2][c] === null) validColumns.push(c);
    }

    if (validColumns.length === 0) return { cardId: hand[0].id, colIndex: 0, isHidden: false };

    const visibleCards = getVisibleCards(player, opponent);
    const remainingDeck = getRemainingDeck(visibleCards);
    const learning = getActiveLearningData();

    // 1. Belief Hand Sampler for Opponent (Cheating/覗き見 Prevention)
    const oppHandSize = opponent.hand.length;
    const opponentHandSamples = sampleOpponentHands(remainingDeck, oppHandSize, 3);

    let bestMove = { cardId: hand[0].id, colIndex: validColumns[0], isHidden: false };
    let currentBestMove = { ...bestMove };
    let depth = 2;
    const maxAllowedDepth = 5; // Maximum depth cap for safety

    // 2. Iterative Deepening ExpectiMax Loop
    while (depth <= maxAllowedDepth) {
        evCache.clear(); // Clear Transposition table for each new depth search
        let depthBestMove = { ...bestMove };
        let depthBestScore = -Infinity;
        let isTimedOut = false;

        for (const card of hand) {
            if (Date.now() - startTime > TIMEOUT_MS) {
                isTimedOut = true;
                break;
            }

            for (const col of validColumns) {
                if (Date.now() - startTime > TIMEOUT_MS) {
                    isTimedOut = true;
                    break;
                }

                // Apply hypothetical move
                const nextGameState = cloneGameState(gameState);
                const nextPlayer = nextGameState.players[playerIndex];
                const emptySlotIdx = [nextPlayer.board[0][col], nextPlayer.board[1][col], nextPlayer.board[2][col]].indexOf(null);
                if (emptySlotIdx !== -1) {
                    nextPlayer.board[emptySlotIdx][col] = card;
                }
                nextPlayer.hand = nextPlayer.hand.filter(c => c.id !== card.id);

                // Calculate average ExpectiMax score across sampled opponent hands
                let averageScore = 0;
                for (const oppHand of opponentHandSamples) {
                    const sampleGameState = cloneGameState(nextGameState);
                    // Override with sampled hand (strictly hiding player's actual hand from AI)
                    sampleGameState.players[1 - playerIndex].hand = oppHand;

                    const score = expectimax(
                        sampleGameState,
                        playerIndex,
                        1, // Current Depth
                        depth,
                        false, // Opponent's turn
                        remainingDeck,
                        params,
                        learning,
                        startTime,
                        TIMEOUT_MS
                    );
                    averageScore += score;
                }
                averageScore /= opponentHandSamples.length;

                // Root heuristic adjustment
                const rootBonus = calculateRootMoveBonus(player, opponent, card, col, emptySlotIdx, gameState.turnCount, params);
                const finalScore = averageScore + rootBonus;

                if (finalScore > depthBestScore) {
                    depthBestScore = finalScore;
                    depthBestMove = { cardId: card.id, colIndex: col, isHidden: false };
                }
            }
        }

        if (isTimedOut) {
            // Discard incomplete depth search results and fallback to previous depth's best move
            break;
        }

        currentBestMove = { ...depthBestMove };
        depth++;
    }

    bestMove = currentBestMove;
    bestMove.isHidden = shouldHideCard(bestMove, hand, player, player.board, gameState.turnCount, opponent, params);

    return bestMove;
}

// ==========================================
// ExpectiMax Search with Timeout Interruption
// ==========================================
function expectimax(
    gameState: GameState,
    playerIndex: number,
    depth: number,
    maxDepth: number,
    isMaxNode: boolean,
    remainingDeck: Card[],
    params: AiParams,
    learning: any,
    startTime: number,
    timeoutMs: number
): number {
    // Interruption check
    if (Date.now() - startTime > timeoutMs) {
        return 0; // Incomplete branch evaluation
    }

    const player = gameState.players[playerIndex];
    const opponent = gameState.players[1 - playerIndex];

    const boardHash = getBoardHash(player, opponent);
    const handHash = getHandHash(player.hand);
    const cacheKey = `${boardHash}_${handHash}_${depth}_${isMaxNode}`;
    if (evCache.has(cacheKey)) {
        return evCache.get(cacheKey)!;
    }

    if (depth === maxDepth || isTerminalState(gameState)) {
        const val = evaluateStaticBoard(player, opponent, remainingDeck, params, learning);
        evCache.set(cacheKey, val);
        return val;
    }

    if (isMaxNode) {
        let maxVal = -Infinity;
        const validColumns = [];
        for (let c = 0; c < 5; c++) {
            if (player.board[2][c] === null) validColumns.push(c);
        }

        if (validColumns.length === 0 || player.hand.length === 0) {
            return evaluateStaticBoard(player, opponent, remainingDeck, params, learning);
        }

        for (const card of player.hand) {
            for (const col of validColumns) {
                const nextGameState = cloneGameState(gameState);
                const nextPlayer = nextGameState.players[playerIndex];
                const emptySlotIdx = [nextPlayer.board[0][col], nextPlayer.board[1][col], nextPlayer.board[2][col]].indexOf(null);
                if (emptySlotIdx !== -1) {
                    nextPlayer.board[emptySlotIdx][col] = card;
                }
                nextPlayer.hand = nextPlayer.hand.filter(c => c.id !== card.id);

                const val = expectimax(nextGameState, playerIndex, depth + 1, maxDepth, false, remainingDeck, params, learning, startTime, timeoutMs);
                if (val > maxVal) {
                    maxVal = val;
                }
            }
        }
        evCache.set(cacheKey, maxVal);
        return maxVal;
    } else {
        // MIN Node (Opponent plays best response)
        let minVal = Infinity;
        const validColumns = [];
        for (let c = 0; c < 5; c++) {
            if (opponent.board[2][c] === null) validColumns.push(c);
        }

        if (validColumns.length === 0 || opponent.hand.length === 0) {
            return evaluateStaticBoard(player, opponent, remainingDeck, params, learning);
        }

        for (const card of opponent.hand) {
            for (const col of validColumns) {
                const nextGameState = cloneGameState(gameState);
                const nextOpponent = nextGameState.players[1 - playerIndex];
                const emptySlotIdx = [nextOpponent.board[0][col], nextOpponent.board[1][col], nextOpponent.board[2][col]].indexOf(null);
                if (emptySlotIdx !== -1) {
                    nextOpponent.board[emptySlotIdx][col] = card;
                }
                nextOpponent.hand = nextOpponent.hand.filter(c => c.id !== card.id);

                const val = expectimax(nextGameState, playerIndex, depth + 1, maxDepth, true, remainingDeck, params, learning, startTime, timeoutMs);
                if (val < minVal) {
                    minVal = val;
                }
            }
        }

        const defensiveScore = minVal * (learning.defensiveAwareness || 0.8);
        evCache.set(cacheKey, defensiveScore);
        return defensiveScore;
    }
}

// ==========================================
// 2D Cross-Synergy Heuristics & EV Calculations
// ==========================================
function evaluateStaticBoard(
    player: GameState['players'][0],
    opponent: GameState['players'][0],
    remainingDeck: Card[],
    params: AiParams,
    learning: any
): number {
    let score = player.score - opponent.score;
    const isLosingBadly = (opponent.score - player.score) > 15;

    // 1. Column-wise Y-Hand (vertical) EV
    for (let c = 0; c < 5; c++) {
        const myCol = [player.board[0][c], player.board[1][c], player.board[2][c]];
        const oppCol = [opponent.board[0][c], opponent.board[1][c], opponent.board[2][c]];
        const diceValue = player.dice[c];

        const colEV = calculateColEV(myCol, oppCol, diceValue, remainingDeck, isLosingBadly, params, learning);
        score += colEV;
    }

    // 2. 2D Cross-Synergy: X-Hand (horizontal) expectation evaluation
    const myXScore = evaluateXHandSynergy(player.board, remainingDeck) * learning.xHandFocus;
    const oppXScore = evaluateXHandSynergy(opponent.board, remainingDeck) * (learning.xHandFocus || 1.0);
    
    score += (myXScore - oppXScore) * 0.5;

    return score;
}

function evaluateXHandSynergy(
    board: (Card | null)[][],
    remainingDeck: Card[]
): number {
    const bottomRow = [...board[2]];
    const emptyIndices = getNullIndices(bottomRow);

    if (emptyIndices.length === 0) {
        const res = evaluateXHand(bottomRow as Card[]);
        return calculateXHandScoreValue(res.type);
    }

    const N = remainingDeck.length;
    if (N < emptyIndices.length) return 0;

    let totalScore = 0;
    const sampleSize = 10;
    
    for (let s = 0; s < sampleSize; s++) {
        const drawn = getRandomSample(remainingDeck, emptyIndices.length);
        const simulatedRow = [...bottomRow];
        emptyIndices.forEach((emptyIdx, i) => {
            simulatedRow[emptyIdx] = drawn[i];
        });
        const res = evaluateXHand(simulatedRow as Card[]);
        totalScore += calculateXHandScoreValue(res.type);
    }

    return totalScore / sampleSize;
}

function calculateXHandScoreValue(type: string): number {
    switch (type) {
        case 'RoyalFlush': return 800;
        case 'StraightFlush': return 600;
        case 'FourOfAKind': return 400;
        case 'FullHouse': return 300;
        case 'Flush': return 200;
        case 'Straight': return 150;
        case 'ThreeOfAKind': return 100;
        case 'TwoPair': return 50;
        case 'OnePair': return 20;
        default: return 0;
    }
}

function calculateColEV(
    myCol: (Card | null)[],
    oppCol: (Card | null)[],
    diceValue: number,
    remainingDeck: Card[],
    isLosingBadly: boolean,
    params: AiParams,
    learning: any
): number {
    const myMissing = myCol.filter(c => c === null).length;
    const oppMissing = oppCol.filter(c => c === null).length;
    const N = remainingDeck.length;

    if (N < myMissing + oppMissing) return 0;

    if (myMissing === 0 && oppMissing === 0) {
        const myRes = evaluateYHand(myCol as Card[], diceValue);
        const oppRes = evaluateYHand(oppCol as Card[], diceValue);
        return compareAndScore(myCol as Card[], myRes, oppRes, diceValue, learning, isLosingBadly);
    }

    let totalScore = 0;
    let totalCombinations = 0;
    const totalMissing = myMissing + oppMissing;

    if (totalMissing <= 2) {
        if (myMissing === 1 && oppMissing === 0) {
            const emptyIdx = myCol.indexOf(null);
            const oppRes = evaluateYHand(oppCol as Card[], diceValue);
            for (let i = 0; i < N; i++) {
                const mySim = [...myCol];
                mySim[emptyIdx] = remainingDeck[i];
                const myRes = evaluateYHand(mySim as Card[], diceValue);
                totalScore += compareAndScore(mySim as Card[], myRes, oppRes, diceValue, learning, isLosingBadly);
            }
            return totalScore / N;
        } 
        else if (myMissing === 0 && oppMissing === 1) {
            const emptyIdx = oppCol.indexOf(null);
            const myRes = evaluateYHand(myCol as Card[], diceValue);
            for (let i = 0; i < N; i++) {
                const oppSim = [...oppCol];
                oppSim[emptyIdx] = remainingDeck[i];
                const oppRes = evaluateYHand(oppSim as Card[], diceValue);
                totalScore += compareAndScore(myCol as Card[], myRes, oppRes, diceValue, learning, isLosingBadly);
            }
            return totalScore / N;
        }
        else if (myMissing === 1 && oppMissing === 1) {
            const myEmptyIdx = myCol.indexOf(null);
            const oppEmptyIdx = oppCol.indexOf(null);
            for (let i = 0; i < N; i++) {
                for (let j = 0; j < N; j++) {
                    if (i === j) continue;
                    const mySim = [...myCol];
                    mySim[myEmptyIdx] = remainingDeck[i];
                    const oppSim = [...oppCol];
                    oppSim[oppEmptyIdx] = remainingDeck[j];

                    const myRes = evaluateYHand(mySim as Card[], diceValue);
                    const oppRes = evaluateYHand(oppSim as Card[], diceValue);
                    totalScore += compareAndScore(mySim as Card[], myRes, oppRes, diceValue, learning, isLosingBadly);
                    totalCombinations++;
                }
            }
            return totalScore / totalCombinations;
        }
        else if (myMissing === 2 && oppMissing === 0) {
            const emptyIndices = getNullIndices(myCol);
            const oppRes = evaluateYHand(oppCol as Card[], diceValue);
            for (let i = 0; i < N; i++) {
                for (let j = i + 1; j < N; j++) {
                    const mySim = [...myCol];
                    mySim[emptyIndices[0]] = remainingDeck[i];
                    mySim[emptyIndices[1]] = remainingDeck[j];
                    const myRes = evaluateYHand(mySim as Card[], diceValue);
                    totalScore += compareAndScore(mySim as Card[], myRes, oppRes, diceValue, learning, isLosingBadly);
                    totalCombinations++;
                }
            }
            return totalScore / totalCombinations;
        }
    }

    const iterations = params.mcSimulations;
    for (let i = 0; i < iterations; i++) {
        const drawnCards = getRandomSample(remainingDeck, totalMissing);
        let drawIndex = 0;

        const mySimulatedCol = myCol.map(c => c === null ? drawnCards[drawIndex++] : c) as Card[];
        const oppSimulatedCol = oppCol.map(c => c === null ? drawnCards[drawIndex++] : c) as Card[];

        const myRes = evaluateYHand(mySimulatedCol, diceValue);
        const oppRes = evaluateYHand(oppSimulatedCol, diceValue);

        totalScore += compareAndScore(mySimulatedCol, myRes, oppRes, diceValue, learning, isLosingBadly);
    }

    return totalScore / iterations;
}

function compareAndScore(
    myCards: Card[],
    myRes: YHandResult,
    oppRes: YHandResult,
    diceValue: number,
    learning: any,
    isLosingBadly: boolean
): number {
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

    if (weWin) {
        return calculateHandValue(myCards, diceValue, learning, isLosingBadly);
    }
    return 0;
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

function calculateRootMoveBonus(
    player: GameState['players'][0],
    opponent: GameState['players'][0],
    card: Card,
    colIndex: number,
    emptySlotIdx: number,
    turnCount: number,
    params: AiParams
): number {
    let bonus = 0;
    const colDice = player.dice[colIndex];

    bonus += (card.rank - 8) * (colDice - 3.5) * 40;

    if (emptySlotIdx === 0) {
        if (card.rank === 14 || card.rank === 13 || card.rank === 2) {
            const hasStraightSynergy = player.hand.some(c => c !== card && Math.abs(c.rank - card.rank) <= 2);
            if (!hasStraightSynergy) {
                bonus += params.lowCardPenalty;
            }
        } else if (card.rank === 12) {
            bonus += params.queenFirstRowBonus;
        }
    }

    if (emptySlotIdx === 2 && colDice >= 3 && turnCount <= 8) {
        bonus -= params.row3DelayPenalty;
    }

    bonus += evaluateOpponentBlock(opponent, colIndex);

    return bonus;
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

// ==========================================
// Game State Utilities & Belief Samplers
// ==========================================
function cloneGameState(state: GameState): GameState {
    return JSON.parse(JSON.stringify(state));
}

function isTerminalState(state: GameState): boolean {
    const p1Full = state.players[0].board[2].every(c => c !== null);
    const p2Full = state.players[1].board[2].every(c => c !== null);
    return p1Full && p2Full;
}

function getNullIndices(arr: (Card | null)[]): number[] {
    const indices: number[] = [];
    arr.forEach((val, idx) => {
        if (val === null) indices.push(idx);
    });
    return indices;
}

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

function sampleOpponentHands(remainingDeck: Card[], handSize: number, count: number): Card[][] {
    const samples: Card[][] = [];
    for (let i = 0; i < count; i++) {
        if (remainingDeck.length >= handSize) {
            samples.push(getRandomSample(remainingDeck, handSize));
        } else {
            samples.push([...remainingDeck]);
        }
    }
    return samples;
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

    const learning = getActiveLearningData();
    const col = move.colIndex;
    const oppColFull = opponent.board[2][col] !== null;
    if (oppColFull) return false;

    let baseProb = 0.05;
    const emptySlotIdx = [board[0][col], board[1][col], board[2][col]].findIndex(c => c === null);
    if (emptySlotIdx === 0) baseProb += 0.4;
    else if (emptySlotIdx === 1) baseProb += 0.2;
    else if (emptySlotIdx === 2) {
        const c0 = board[0][col];
        const c1 = board[1][col];
        if (c0 && c1 && c0.rank === c1.rank && c0.rank === card.rank) {
            baseProb += 0.8;
        }
    }
    
    if (turnCount <= 6) baseProb += 0.2;

    const myDice = player.dice[col];
    const oppDice = opponent.dice[col];
    if (card.rank <= 6 && myDice >= 4) baseProb += 0.3;
    if (card.rank >= 11 && oppDice >= 4) baseProb += 0.3;

    let isDenyingOut = false;
    for (let c = 0; c < 5; c++) {
        const oppCards = [opponent.board[0][c], opponent.board[1][c], opponent.board[2][c]].filter(x => x !== null) as Card[];
        if (oppCards.length === 2) {
            const r1 = oppCards[0].rank;
            const r2 = oppCards[1].rank;
            const s1 = oppCards[0].suit;
            const s2 = oppCards[1].suit;

            if (s1 === s2 && card.suit === s1) isDenyingOut = true;
            
            const minR = Math.min(r1, r2);
            const maxR = Math.max(r1, r2);
            if (maxR - minR <= 3 && card.rank >= minR - 2 && card.rank <= maxR + 2) isDenyingOut = true;

            if (card.rank === r1 || card.rank === r2) isDenyingOut = true;
        }
    }

    if (isDenyingOut) {
        baseProb += 0.6;
    }

    baseProb *= (params.bluffBonus / 150);

    return Math.random() < (baseProb * learning.hidingStrategy / 0.3);
}
