import { createDeck } from './deck';
import { gameReducer } from './game';
import { getGtoHideProbability, getGtoTurnOrderScore, scoreGtoMove } from './gtoPolicy';
import type { Card, GameState } from './types';

export interface AiParams {
    // Legacy tuning keys remain part of the public shape so old training tools
    // and stored champion files keep loading. Runtime play is governed by the
    // fixed XY-GTO policy plus information-set rollouts below.
    tripsInHandBonus: number;
    pairInHandBonus: number;
    lowCardPenalty: number;
    queenFirstRowBonus: number;
    showdownDelayPenalty: number;
    row3DelayPenalty: number;
    bluffBonus: number;
    mcSimulations: number;
    turnOrderBaseFirstValue: number;
    turnOrderPairBonus: number;
    turnOrderHighCardBonus: number;
    gtoPriorWeight: number;
    timeBudgetMs: number;
}

export const DEFAULT_AI_PARAMS: AiParams = {
    tripsInHandBonus: 99,
    pairInHandBonus: 12,
    lowCardPenalty: -650,
    queenFirstRowBonus: 220,
    showdownDelayPenalty: 450,
    row3DelayPenalty: 600,
    bluffBonus: 2,
    mcSimulations: 20,
    turnOrderBaseFirstValue: 0,
    turnOrderPairBonus: 2,
    turnOrderHighCardBonus: 2,
    gtoPriorWeight: 0.2,
    timeBudgetMs: 400,
};

export interface AiDecisionDiagnostics {
    elapsedMs: number;
    legalMoves: number;
    searchedMoves: number;
    completedBeliefSamples: number;
    usedRollout: boolean;
}

interface ScoredMove {
    cardId: string;
    colIndex: number;
    gtoScore: number;
}

let lastDecisionDiagnostics: AiDecisionDiagnostics = {
    elapsedMs: 0,
    legalMoves: 0,
    searchedMoves: 0,
    completedBeliefSamples: 0,
    usedRollout: false,
};

export function getLastAiDecisionDiagnostics(): AiDecisionDiagnostics {
    return { ...lastDecisionDiagnostics };
}

export function getBestTurnOrder(
    gameState: GameState,
    playerIndex: number,
    params: AiParams = DEFAULT_AI_PARAMS,
): boolean {
    void params;
    return getGtoTurnOrderScore(gameState.players[playerIndex]) > 0;
}

/**
 * Selects a move without inspecting the true opponent hand, hidden-card
 * identities, or deck order. Each rollout samples a complete world consistent
 * with the acting player's information set, then plays the real reducer to the
 * end. Standard draws, completion bonus draws, turn passing, Y scoring, and X
 * scoring are therefore evaluated under the same rules as an actual match.
 */
export function getBestMove(
    gameState: GameState,
    playerIndex: number,
    params: AiParams = DEFAULT_AI_PARAMS,
): { cardId: string; colIndex: number; isHidden: boolean } {
    const startedAt = now();
    const player = gameState.players[playerIndex];
    const legalMoves = enumeratePlacements(gameState, playerIndex as 0 | 1);

    if (legalMoves.length === 0) {
        const fallback = { cardId: player.hand[0]?.id ?? '', colIndex: 0, isHidden: false };
        setDiagnostics(startedAt, 0, 0, 0);
        return fallback;
    }

    const candidates = selectRootCandidates(legalMoves);
    const fallback = candidates[0];
    const timeoutMs = clampFinite(params.timeBudgetMs, 1, 2_000, DEFAULT_AI_PARAMS.timeBudgetMs);
    const deadline = startedAt + Math.max(0, timeoutMs - 4);
    const requestedSamples = Math.round(clampFinite(
        params.mcSimulations,
        1,
        48,
        DEFAULT_AI_PARAMS.mcSimulations,
    ));
    const totals = candidates.map(() => 0);
    const squaredTotals = candidates.map(() => 0);
    const informationSeed = hashInformationState(gameState, playerIndex as 0 | 1);
    let completedSamples = 0;
    let previousSampleMs = 0;

    for (let sampleIndex = 0; sampleIndex < requestedSamples; sampleIndex++) {
        const sampleStartedAt = now();
        if (sampleIndex > 0 && sampleStartedAt + Math.max(previousSampleMs * 1.15, 2) >= deadline) break;

        const beliefSeed = mixSeed(informationSeed, sampleIndex, 0x42454c49);
        const beliefState = sampleInformationSet(gameState, playerIndex as 0 | 1, beliefSeed);
        const sampleScores: number[] = [];
        let complete = true;

        for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
            if (now() >= deadline) {
                complete = false;
                break;
            }

            const candidate = candidates[candidateIndex];
            // Common random numbers keep chance noise comparable across root
            // candidates inside the same determinization.
            const rolloutRandom = seededRandom(mixSeed(beliefSeed, 0x524f4c4c));
            const selectedCard = beliefState.players[playerIndex].hand.find(card => card.id === candidate.cardId);
            if (!selectedCard) {
                complete = false;
                break;
            }
            const isHidden = rolloutRandom() < getGtoHideProbability(
                beliefState,
                playerIndex as 0 | 1,
                selectedCard,
                candidate.colIndex,
            );
            const afterMove = gameReducer(beliefState, {
                type: 'PLACE_AND_DRAW',
                payload: { cardId: candidate.cardId, colIndex: candidate.colIndex, isHidden },
            });
            const result = rolloutToEnd(afterMove, playerIndex as 0 | 1, rolloutRandom, deadline);
            if (result === null) {
                complete = false;
                break;
            }
            sampleScores.push(result);
        }

        if (!complete || sampleScores.length !== candidates.length) break;
        for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
            totals[candidateIndex] += sampleScores[candidateIndex];
            squaredTotals[candidateIndex] += sampleScores[candidateIndex] ** 2;
        }
        completedSamples++;
        previousSampleMs = now() - sampleStartedAt;
    }

    let selected = fallback;
    if (completedSamples > 0) {
        const robustOutcomes = totals.map((total, index) => {
            const mean = total / completedSamples;
            if (completedSamples === 1) return mean;
            const variance = Math.max(0, squaredTotals[index] / completedSamples - mean ** 2);
            // A small confidence penalty avoids chasing a lucky determinization.
            return mean - Math.sqrt(variance / completedSamples) * 0.08;
        });
        const normalizedOutcomes = normalizeScores(robustOutcomes);
        const normalizedPriors = normalizeScores(candidates.map(candidate => candidate.gtoScore));
        const priorWeight = clampFinite(
            params.gtoPriorWeight,
            0.05,
            0.65,
            DEFAULT_AI_PARAMS.gtoPriorWeight,
        );
        let bestIndex = 0;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (let index = 0; index < candidates.length; index++) {
            const blendedScore = normalizedOutcomes[index] * (1 - priorWeight)
                + normalizedPriors[index] * priorWeight;
            if (blendedScore > bestScore) {
                bestScore = blendedScore;
                bestIndex = index;
            }
        }
        selected = candidates[bestIndex];
    }

    const selectedCard = player.hand.find(card => card.id === selected.cardId) ?? player.hand[0];
    const hideProbability = selectedCard
        ? getGtoHideProbability(
            gameState,
            playerIndex as 0 | 1,
            selectedCard,
            selected.colIndex,
        )
        : 0;
    setDiagnostics(startedAt, legalMoves.length, candidates.length, completedSamples);
    return {
        cardId: selected.cardId,
        colIndex: selected.colIndex,
        isHidden: Math.random() < hideProbability,
    };
}

function enumeratePlacements(state: GameState, playerIndex: 0 | 1): ScoredMove[] {
    const player = state.players[playerIndex];
    const moves: ScoredMove[] = [];
    for (const card of player.hand) {
        for (let column = 0; column < 5; column++) {
            if (player.board[2][column] !== null) continue;
            moves.push({
                cardId: card.id,
                colIndex: column,
                gtoScore: scoreGtoMove(state, playerIndex, card, column),
            });
        }
    }
    return moves.sort((a, b) => b.gtoScore - a.gtoScore);
}

function selectRootCandidates(moves: ScoredMove[]): ScoredMove[] {
    const limit = 20;
    if (moves.length <= limit) return moves;

    const selected: ScoredMove[] = [];
    const selectedKeys = new Set<string>();
    const add = (move: ScoredMove | undefined) => {
        if (!move) return;
        const key = `${move.cardId}:${move.colIndex}`;
        if (selectedKeys.has(key) || selected.length >= limit) return;
        selectedKeys.add(key);
        selected.push(move);
    };

    // Preserve card and column diversity before filling from the overall prior.
    for (let column = 0; column < 5; column++) add(moves.find(move => move.colIndex === column));
    for (const cardId of new Set(moves.map(move => move.cardId))) {
        add(moves.find(move => move.cardId === cardId));
    }
    for (const move of moves) add(move);
    return selected.sort((a, b) => b.gtoScore - a.gtoScore);
}

function rolloutToEnd(
    initialState: GameState,
    rootPlayerIndex: 0 | 1,
    random: () => number,
    deadline: number,
): number | null {
    let state = initialState;
    let safety = 0;
    while (state.phase === 'playing' && safety < 40) {
        if ((safety & 3) === 0 && now() >= deadline) return null;
        const actor = state.currentPlayerIndex as 0 | 1;
        const move = selectRolloutMove(state, actor, random);
        const nextState = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        if (nextState === state) return null;
        state = nextState;
        safety++;
    }
    if (state.phase === 'scoring') state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    if (state.phase !== 'ended') return null;

    const rootId = rootPlayerIndex === 0 ? 'p1' : 'p2';
    const opponentId = rootPlayerIndex === 0 ? 'p2' : 'p1';
    const winUtility = state.winner === rootId ? 1 : state.winner === opponentId ? -1 : 0;
    const scoreDifference = state.players[rootPlayerIndex].score - state.players[1 - rootPlayerIndex].score;
    return winUtility + Math.max(-0.45, Math.min(0.45, scoreDifference / 40));
}

function selectRolloutMove(
    state: GameState,
    playerIndex: 0 | 1,
    random: () => number,
): { cardId: string; colIndex: number; isHidden: boolean } {
    const placements = enumeratePlacements(state, playerIndex);
    const selected = placements[0];
    const card = state.players[playerIndex].hand.find(candidate => candidate.id === selected.cardId);
    return {
        cardId: selected.cardId,
        colIndex: selected.colIndex,
        isHidden: card
            ? random() < getGtoHideProbability(state, playerIndex, card, selected.colIndex)
            : false,
    };
}

function sampleInformationSet(state: GameState, playerIndex: 0 | 1, seed: number): GameState {
    const sampled = cloneGameState(state);
    const opponentIndex = (1 - playerIndex) as 0 | 1;
    const opponent = sampled.players[opponentIndex];
    const hiddenPositions: Array<{ row: number; column: number }> = [];
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 5; column++) {
            if (opponent.board[row][column]?.isHidden) hiddenPositions.push({ row, column });
        }
    }

    const unseen = getRemainingDeck(getKnownCards(state, playerIndex));
    shuffleInPlace(unseen, seededRandom(seed));
    let cursor = 0;
    for (const position of hiddenPositions) {
        const card = unseen[cursor++];
        if (card) opponent.board[position.row][position.column] = { ...card, isHidden: true };
    }
    opponent.hand = unseen
        .slice(cursor, cursor + state.players[opponentIndex].hand.length)
        .map(card => ({ ...card, isHidden: false }));
    cursor += opponent.hand.length;
    sampled.deck = unseen.slice(cursor, cursor + state.deck.length).map(card => ({ ...card, isHidden: false }));
    return sampled;
}

function getKnownCards(state: GameState, playerIndex: 0 | 1): Card[] {
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];
    const known = [...player.hand];
    for (const card of player.board.flat()) {
        if (card) known.push(card);
    }
    for (const card of opponent.board.flat()) {
        if (card && !card.isHidden) known.push(card);
    }
    return known;
}

function cloneGameState(state: GameState): GameState {
    return structuredClone(state);
}

export function getRemainingDeck(visibleCards: Card[]): Card[] {
    const visibleIds = new Set(visibleCards.map(card => card.id));
    return createDeck().filter(card => !visibleIds.has(card.id));
}

function normalizeScores(values: number[]): number[] {
    const finite = values.filter(Number.isFinite);
    if (finite.length === 0) return values.map(() => 0);
    const minimum = Math.min(...finite);
    const maximum = Math.max(...finite);
    if (maximum === minimum) return values.map(() => 0.5);
    return values.map(value => Number.isFinite(value) ? (value - minimum) / (maximum - minimum) : 0);
}

function hashInformationState(state: GameState, playerIndex: 0 | 1): number {
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];
    const ownBoard = player.board.flat().map(card => card?.id ?? '-').join(',');
    const opponentBoard = opponent.board.flat().map(card => (
        card?.isHidden ? '?' : card?.id ?? '-'
    )).join(',');
    return hashString([
        state.turnCount,
        state.currentPlayerIndex,
        player.hand.map(card => card.id).sort().join(','),
        ownBoard,
        opponentBoard,
        player.dice.join(','),
        opponent.hand.length,
        state.deck.length,
    ].join('|'));
}

function hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function mixSeed(...values: number[]): number {
    let hash = 0x811c9dc5;
    for (const value of values) {
        hash ^= value >>> 0;
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function seededRandom(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value = (value + 0x6d2b79f5) >>> 0;
        let result = value;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
    };
}

function shuffleInPlace<T>(values: T[], random: () => number): void {
    for (let index = values.length - 1; index > 0; index--) {
        const target = Math.floor(random() * (index + 1));
        [values[index], values[target]] = [values[target], values[index]];
    }
}

function clampFinite(value: number, minimum: number, maximum: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, value));
}

function now(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function setDiagnostics(
    startedAt: number,
    legalMoves: number,
    searchedMoves: number,
    completedBeliefSamples: number,
): void {
    lastDecisionDiagnostics = {
        elapsedMs: now() - startedAt,
        legalMoves,
        searchedMoves,
        completedBeliefSamples,
        usedRollout: completedBeliefSamples > 0,
    };
}
