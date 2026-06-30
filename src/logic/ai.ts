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
    pairPenalty: -30,
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
    console.log('[AI Engine] Hydrating decision engine with 12-parameter Global Collaborative AI weights:', params);
    activeGlobalParams = params;
}

function getActiveLearningData(): any {
    const localLearning = getLearningData();
    if (!activeGlobalParams) {
        return {
            ...localLearning,
            purePreference: 0.700,
            tripsInHandFocus: 1.350,
            row3DelayFocus: 1.400,
            showdownDelayFocus: 1.200,
            lowCardAvoidance: 1.500,
            turnOrderFlexibility: 1.100,
        };
    }
    // Map database snake_case parameters to game's camelCase variables (12 parameters)
    return {
        ...localLearning,
        tripPreference: activeGlobalParams.trip_preference ?? localLearning.tripPreference,
        flushPreference: activeGlobalParams.flush_preference ?? localLearning.flushPreference,
        straightPreference: activeGlobalParams.straight_preference ?? localLearning.straightPreference,
        xHandFocus: activeGlobalParams.x_hand_focus ?? localLearning.xHandFocus,
        bonusAggression: activeGlobalParams.bonus_aggression ?? localLearning.bonusAggression,
        defensiveAwareness: activeGlobalParams.defensive_awareness ?? localLearning.defensiveAwareness,
        // strategy.md Compliant features
        purePreference: activeGlobalParams.pure_preference ?? 1.0,
        tripsInHandFocus: activeGlobalParams.trips_in_hand_focus ?? 1.0,
        row3DelayFocus: activeGlobalParams.row3_delay_focus ?? 1.0,
        showdownDelayFocus: activeGlobalParams.showdown_delay_focus ?? 1.0,
        lowCardAvoidance: activeGlobalParams.low_card_avoidance ?? 1.0,
        turnOrderFlexibility: activeGlobalParams.turn_order_flexibility ?? 1.0,
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

    const learning = getActiveLearningData();

    let score = params.turnOrderBaseFirstValue;
    // Apply turnOrderFlexibility from collaborative learning pool
    if (hasPair) score += params.turnOrderPairBonus * learning.turnOrderFlexibility;
    if (highCardsCount >= 2) score += params.turnOrderHighCardBonus * learning.turnOrderFlexibility;

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
    const maxAllowedDepth = 5;

    // 2. Iterative Deepening ExpectiMax Loop
    while (depth <= maxAllowedDepth) {
        evCache.clear();
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
                    sampleGameState.players[1 - playerIndex].hand = oppHand;

                    const score = expectimax(
                        sampleGameState,
                        playerIndex,
                        1,
                        depth,
                        false,
                        remainingDeck,
                        params,
                        learning,
                        startTime,
                        TIMEOUT_MS
                    );
                    averageScore += score;
                }
                averageScore /= opponentHandSamples.length;

                // Root heuristic adjustment with strategy.md parameters
                const rootBonus = calculateRootMoveBonus(player, opponent, card, col, emptySlotIdx, gameState.turnCount, params, learning);
                const finalScore = averageScore + rootBonus;

                if (finalScore > depthBestScore) {
                    depthBestScore = finalScore;
                    depthBestMove = { cardId: card.id, colIndex: col, isHidden: false };
                }
            }
        }

        if (isTimedOut) {
            break;
        }

        currentBestMove = { ...depthBestMove };
        depth++;
    }

    bestMove = currentBestMove;
    bestMove.isHidden = shouldHideCard(bestMove, hand, player, player.board, gameState.turnCount, opponent, params, learning);

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
    if (Date.now() - startTime > timeoutMs) {
        return 0;
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

    // Apply pure_preference multiplier from global learning pool
    if (result.type.startsWith('Pure')) {
        baseValue *= (learning.purePreference ?? 1.0);
    }

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
    params: AiParams,
    learning: any
): number {
    let bonus = 0;
    const colDice = player.dice[colIndex];

    bonus += (card.rank - 8) * (colDice - 3.5) * 40;

    // Apply low_card_avoidance to low card penalties
    if (emptySlotIdx === 0) {
        if (card.rank === 14 || card.rank === 13 || card.rank === 2) {
            const hasStraightSynergy = player.hand.some(c => c !== card && Math.abs(c.rank - card.rank) <= 2);
            if (!hasStraightSynergy) {
                bonus += params.lowCardPenalty * (learning.lowCardAvoidance ?? 1.0);
            }
        } else if (card.rank === 12) {
            bonus += params.queenFirstRowBonus;
        }
    }

    // Apply row3_delay_focus to row 3 delay penalty
    if (emptySlotIdx === 2 && colDice >= 3 && turnCount <= 8) {
        bonus -= params.row3DelayPenalty * (learning.row3DelayFocus ?? 1.0);
    }

    // Apply showdown_delay_focus to showdown delay decisions
    const oppCol = [opponent.board[0][colIndex], opponent.board[1][colIndex], opponent.board[2][colIndex]];
    const oppCards = oppCol.filter(c => c !== null) as Card[];
    const myCol = [player.board[0][colIndex], player.board[1][colIndex], player.board[2][colIndex]];
    const myCards = myCol.filter(c => c !== null) as Card[];
    
    if (emptySlotIdx === 2 && oppCards.length >= 2 && myCards.length === 2) {
        // AI is about to fill the column and finalize it. If AI is already winning by far, slow play!
        const tempCol = [...myCol];
        tempCol[2] = card;
        const myRes = evaluateYHand(tempCol as Card[], colDice);
        const oppRes = evaluateYHand(oppCards, colDice);
        const weWin = myRes.rankValue > oppRes.rankValue;
        if (weWin && turnCount <= 9) {
            bonus -= params.showdownDelayPenalty * (learning.showdownDelayFocus ?? 1.0);
        }
    }

    // Apply trips_in_hand_focus to Trips and Pairs hand values
    const handRanks = player.hand.map(c => c.rank);
    const tripsRanks = handRanks.filter((r, _, self) => self.filter(x => x === r).length === 3);
    const pairRanks = handRanks.filter((r, _, self) => self.filter(x => x === r).length === 2);
    
    if (tripsRanks.includes(card.rank)) {
        bonus += params.tripsInHandBonus * (learning.tripsInHandFocus ?? 1.0);
    } else if (pairRanks.includes(card.rank)) {
        bonus += params.pairInHandBonus;
    }

    // Penalize completing columns with weak hands (HighCard or plain OnePair)
    // This is the primary mechanism to steer the AI away from weak finishes
    if (emptySlotIdx === 2) {
        const myCol = [player.board[0][colIndex], player.board[1][colIndex], player.board[2][colIndex]];
        const tempCol = [...myCol];
        tempCol[2] = card; // Simulate placing this card
        const colDiceVal = player.dice[colIndex];
        const projectedResult = evaluateYHand(tempCol as Card[], colDiceVal);
        if (projectedResult.rankValue === 1) {
            // HighCard: very heavily penalized — this outcome should almost never be chosen
            bonus -= 800;
        } else if (projectedResult.rankValue === 2) {
            // Plain OnePair (non-pure): significantly penalized
            bonus -= 400;
        } else if (projectedResult.rankValue === 3) {
            // Plain Straight (non-pure): moderately penalized — weaker than PureOnePair or Flush
            bonus -= 200;
        }
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
    params: AiParams,
    learning: any
): boolean {
    if (player.hiddenCardsCount >= 3) return false;

    // Calculate remaining empty spaces and hidden cards quota
    const emptySpaces = board.flat().filter(cell => cell === null).length;
    const remainingNorma = 3 - player.hiddenCardsCount;

    // Forced hidden placement: ensure all 3 hidden cards are used up before board is full
    if (emptySpaces <= remainingNorma || 
        (emptySpaces <= 12 && remainingNorma === 3) ||
        (emptySpaces <= 8 && remainingNorma === 2) || 
        (emptySpaces <= 4 && remainingNorma === 1)) {
        return true;
    }

    let hiddenInCol = 0;
    for (let r = 0; r < 3; r++) {
        const c = board[r][move.colIndex];
        if (c && c.isHidden) hiddenInCol++;
    }
    if (hiddenInCol >= 2) return false;

    const card = hand.find(c => c.id === move.cardId);
    if (!card) return false;

    const col = move.colIndex;
    const oppColFull = opponent.board[2][col] !== null;
    if (oppColFull) return false;

    let baseProb = 0.05;
    const emptySlotIdx = [board[0][col], board[1][col], board[2][col]].findIndex(c => c === null);

    // First card in column: LOW value to hide — opponent can't read a 1-card column anyway
    if (emptySlotIdx === 0) baseProb += 0.10;
    // Second card: MEDIUM — now opponent might start reading the pattern
    else if (emptySlotIdx === 1) baseProb += 0.20;
    // Third card completing trips: HIGH — hide the finishing blow for maximum surprise
    else if (emptySlotIdx === 2) {
        const c0 = board[0][col];
        const c1 = board[1][col];
        if (c0 && c1 && c0.rank === c1.rank && c0.rank === card.rank) {
            baseProb += 0.8; // Completing 3-of-a-kind = maximum hiding value
        } else {
            baseProb += 0.10; // Other 3rd card: mild benefit
        }
    }

    // Early game: mild bonus — spread hidden cards through the game, not dump all at once
    // The forced quota system already guarantees completion; this just nudges timing slightly earlier
    if (turnCount <= 4) baseProb += 0.15;      // Slight early preference
    else if (turnCount <= 8) baseProb += 0.08; // Very mild mid-game nudge

    // Weak card on a winning column dice: hide the weakness
    const myDice = player.dice[col];
    const oppDice = opponent.dice[col];
    if (card.rank <= 6 && myDice >= 4) baseProb += 0.3;
    // Strong card on opponent-favoured column: hide key blocker
    if (card.rank >= 11 && oppDice >= 4) baseProb += 0.3;

    // Denying opponent's hand: HIGHEST strategic value — hide the disruption card
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
        baseProb += 0.6; // Disruption hiding is highly valuable
    }

    baseProb *= (params.bluffBonus / 2);

    const finalProb = Math.min(baseProb * learning.hidingStrategy / 0.3, 1);
    return Math.random() < finalProb;
}
