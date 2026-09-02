import { createDeck } from './deck';
import { gameReducer } from './game';
import {
    getGtoHideProbability,
    getGtoTurnOrderScore,
    scoreGtoMove,
    XY_GTO_A3,
    XY_GTO_A4,
    XY_GTO_A4_SOLVER_BASE,
    XY_GTO_A6,
    type GtoPolicyWeights,
} from './gtoPolicy';
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
    /** False retains the A4-only rollout as an auditable runtime baseline. */
    generalizedSearch?: boolean;
    /** False isolates broad root actions from multi-policy opponent modeling. */
    multiPolicyRollouts?: boolean;
}

export const DEFAULT_AI_PARAMS: AiParams = {
    tripsInHandBonus: 99,
    pairInHandBonus: 12,
    lowCardPenalty: -650,
    queenFirstRowBonus: 220,
    showdownDelayPenalty: 450,
    row3DelayPenalty: 600,
    bluffBonus: 2,
    mcSimulations: 64,
    turnOrderBaseFirstValue: 0,
    turnOrderPairBonus: 2,
    turnOrderHighCardBonus: 2,
    gtoPriorWeight: 0.2,
    timeBudgetMs: 1_000,
    generalizedSearch: true,
    multiPolicyRollouts: false,
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

interface RootAction extends ScoredMove {
    isHidden: boolean;
}

interface RolloutProfile {
    opponentWeights: Readonly<GtoPolicyWeights>;
    opponentTemperature: number;
}

const ROLLOUT_PROFILES: readonly RolloutProfile[] = [
    { opponentWeights: XY_GTO_A6, opponentTemperature: 0 },
    { opponentWeights: XY_GTO_A4, opponentTemperature: 0 },
    { opponentWeights: XY_GTO_A4_SOLVER_BASE, opponentTemperature: 0 },
    { opponentWeights: XY_GTO_A3, opponentTemperature: 0 },
];

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
    const generalizedSearch = params.generalizedSearch !== false;
    const profiles = generalizedSearch && params.multiPolicyRollouts !== false
        ? ROLLOUT_PROFILES
        : ROLLOUT_PROFILES.slice(0, 1);
    const legalMoves = generalizedSearch
        ? enumerateRootActions(gameState, playerIndex as 0 | 1)
        : enumeratePlacements(gameState, playerIndex as 0 | 1).map(move => ({ ...move, isHidden: false }));

    if (legalMoves.length === 0) {
        const fallback = { cardId: player.hand[0]?.id ?? '', colIndex: 0, isHidden: false };
        setDiagnostics(startedAt, 0, 0, 0);
        return fallback;
    }

    const candidates = selectRootCandidates(legalMoves, generalizedSearch ? 60 : 20);
    const fallback = candidates[0];
    const timeoutMs = clampFinite(params.timeBudgetMs, 1, 2_000, DEFAULT_AI_PARAMS.timeBudgetMs);
    const deadline = startedAt + Math.max(0, timeoutMs - 4);
    const requestedSamples = Math.round(clampFinite(
        params.mcSimulations,
        1,
        96,
        DEFAULT_AI_PARAMS.mcSimulations,
    ));
    const totals = candidates.map(() => 0);
    const squaredTotals = candidates.map(() => 0);
    const sampleCounts = candidates.map(() => 0);
    const profileTotals = candidates.map(() => profiles.map(() => 0));
    const profileCounts = candidates.map(() => profiles.map(() => 0));
    const informationSeed = hashInformationState(gameState, playerIndex as 0 | 1);
    let activeIndices = candidates.map((_, index) => index);
    let completedSamples = 0;
    let previousSampleMs = 0;

    for (let sampleIndex = 0; sampleIndex < requestedSamples; sampleIndex++) {
        const sampleStartedAt = now();
        if (sampleIndex > 0 && sampleStartedAt + Math.max(previousSampleMs * 1.15, 2) >= deadline) break;

        const beliefSeed = mixSeed(informationSeed, sampleIndex, 0x42454c49);
        const beliefState = sampleInformationSet(gameState, playerIndex as 0 | 1, beliefSeed);
        const profileIndex = sampleIndex % profiles.length;
        const profile = profiles[profileIndex];
        const sampleScores = new Map<number, number>();
        let complete = true;

        for (const candidateIndex of activeIndices) {
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
            const afterMove = gameReducer(beliefState, {
                type: 'PLACE_AND_DRAW',
                payload: {
                    cardId: candidate.cardId,
                    colIndex: candidate.colIndex,
                    isHidden: candidate.isHidden,
                },
            });
            const result = rolloutToEnd(
                afterMove,
                playerIndex as 0 | 1,
                rolloutRandom,
                deadline,
                profile,
            );
            if (result === null) {
                complete = false;
                break;
            }
            sampleScores.set(candidateIndex, result);
        }

        if (!complete || sampleScores.size !== activeIndices.length) break;
        for (const [candidateIndex, score] of sampleScores) {
            totals[candidateIndex] += score;
            squaredTotals[candidateIndex] += score ** 2;
            sampleCounts[candidateIndex]++;
            profileTotals[candidateIndex][profileIndex] += score;
            profileCounts[candidateIndex][profileIndex]++;
        }
        completedSamples++;
        previousSampleMs = now() - sampleStartedAt;

        // Evaluate every plausible placement and face-up/face-down action first,
        // then spend the remaining budget on the strongest diverse finalists.
        if (generalizedSearch
            && completedSamples === Math.min(8, requestedSamples)
            && activeIndices.length > 16) {
            activeIndices = [...activeIndices]
                .sort((left, right) => candidateRolloutObjective(
                    right,
                    totals,
                    squaredTotals,
                    sampleCounts,
                    profileTotals,
                    profileCounts,
                ) - candidateRolloutObjective(
                    left,
                    totals,
                    squaredTotals,
                    sampleCounts,
                    profileTotals,
                    profileCounts,
                ))
                .slice(0, 16);
        }
    }

    let selected = fallback;
    if (completedSamples > 0) {
        const robustOutcomes = candidates.map((_, index) => candidateRolloutObjective(
            index,
            totals,
            squaredTotals,
            sampleCounts,
            profileTotals,
            profileCounts,
        ));
        const normalizedOutcomes = normalizeScores(robustOutcomes);
        const normalizedPriors = normalizeScores(candidates.map(candidate => candidate.gtoScore));
        const priorWeight = clampFinite(
            params.gtoPriorWeight,
            0.05,
            0.65,
            DEFAULT_AI_PARAMS.gtoPriorWeight,
        );
        let bestIndex = activeIndices[0] ?? 0;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const index of activeIndices) {
            const blendedScore = normalizedOutcomes[index] * (1 - priorWeight)
                + normalizedPriors[index] * priorWeight;
            if (blendedScore > bestScore) {
                bestScore = blendedScore;
                bestIndex = index;
            }
        }
        selected = candidates[bestIndex];
    }

    const selectedCard = player.hand.find(card => card.id === selected.cardId);
    const selectedHidden = generalizedSearch
        ? selected.isHidden
        : Boolean(selectedCard && Math.random() < getGtoHideProbability(
            gameState,
            playerIndex as 0 | 1,
            selectedCard,
            selected.colIndex,
        ));
    setDiagnostics(startedAt, legalMoves.length, candidates.length, completedSamples);
    return {
        cardId: selected.cardId,
        colIndex: selected.colIndex,
        isHidden: selectedHidden,
    };
}

function candidateRolloutObjective(
    index: number,
    totals: number[],
    squaredTotals: number[],
    sampleCounts: number[],
    profileTotals: number[][],
    profileCounts: number[][],
): number {
    const count = sampleCounts[index];
    if (count === 0) return Number.NEGATIVE_INFINITY;
    const mean = totals[index] / count;
    const variance = count > 1
        ? Math.max(0, squaredTotals[index] / count - mean ** 2)
        : 0;
    const standardError = Math.sqrt(variance / count);
    const profileMeans = profileTotals[index]
        .map((total, profileIndex) => {
            const profileCount = profileCounts[index][profileIndex];
            return profileCount > 0 ? total / profileCount : null;
        })
        .filter((value): value is number => value !== null);
    const worstProfile = profileMeans.length > 0 ? Math.min(...profileMeans) : mean;
    // A small maximin component makes a move robust to opponent policy shifts;
    // the confidence term prevents a lucky determinization from winning.
    return mean * 0.8 + worstProfile * 0.2 - standardError * 0.08;
}

function enumeratePlacements(
    state: GameState,
    playerIndex: 0 | 1,
    weights: Readonly<GtoPolicyWeights> = XY_GTO_A6,
): ScoredMove[] {
    const player = state.players[playerIndex];
    const moves: ScoredMove[] = [];
    for (const card of player.hand) {
        for (let column = 0; column < 5; column++) {
            if (player.board[2][column] !== null) continue;
            moves.push({
                cardId: card.id,
                colIndex: column,
                gtoScore: scoreGtoMove(state, playerIndex, card, column, weights),
            });
        }
    }
    return moves.sort((a, b) => b.gtoScore - a.gtoScore);
}

function enumerateRootActions(state: GameState, playerIndex: 0 | 1): RootAction[] {
    const player = state.players[playerIndex];
    const placements = enumeratePlacements(state, playerIndex);
    const actions: RootAction[] = [];
    for (const placement of placements) {
        const card = player.hand.find(candidate => candidate.id === placement.cardId);
        if (!card) continue;
        const hideProbability = getGtoHideProbability(
            state,
            playerIndex,
            card,
            placement.colIndex,
        );
        actions.push({
            ...placement,
            isHidden: false,
            gtoScore: placement.gtoScore + (0.5 - hideProbability) * 0.04,
        });
        const hiddenInColumn = player.board.reduce(
            (count, row) => count + (row[placement.colIndex]?.isHidden ? 1 : 0),
            0,
        );
        if (player.hiddenCardsCount < 3 && hiddenInColumn < 2) {
            actions.push({
                ...placement,
                isHidden: true,
                gtoScore: placement.gtoScore + (hideProbability - 0.5) * 0.04,
            });
        }
    }
    return actions.sort((left, right) => right.gtoScore - left.gtoScore);
}

function selectRootCandidates(moves: RootAction[], limit: number): RootAction[] {
    if (moves.length <= limit) return moves;

    const selected: RootAction[] = [];
    const selectedKeys = new Set<string>();
    const add = (move: RootAction | undefined) => {
        if (!move) return;
        const key = `${move.cardId}:${move.colIndex}:${move.isHidden ? 1 : 0}`;
        if (selectedKeys.has(key) || selected.length >= limit) return;
        selectedKeys.add(key);
        selected.push(move);
    };

    // Preserve card, column and information-action diversity before filling by prior.
    for (let column = 0; column < 5; column++) {
        add(moves.find(move => move.colIndex === column && !move.isHidden));
        add(moves.find(move => move.colIndex === column && move.isHidden));
    }
    for (const cardId of new Set(moves.map(move => move.cardId))) {
        add(moves.find(move => move.cardId === cardId && !move.isHidden));
        add(moves.find(move => move.cardId === cardId && move.isHidden));
    }
    for (const move of moves) add(move);
    return selected.sort((a, b) => b.gtoScore - a.gtoScore);
}

function rolloutToEnd(
    initialState: GameState,
    rootPlayerIndex: 0 | 1,
    random: () => number,
    deadline: number,
    profile: RolloutProfile,
): number | null {
    let state = initialState;
    let safety = 0;
    while (state.phase === 'playing' && safety < 40) {
        if ((safety & 3) === 0 && now() >= deadline) return null;
        const actor = state.currentPlayerIndex as 0 | 1;
        const move = selectRolloutMove(state, actor, rootPlayerIndex, profile, random);
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
    rootPlayerIndex: 0 | 1,
    profile: RolloutProfile,
    random: () => number,
): { cardId: string; colIndex: number; isHidden: boolean } {
    const isRootPlayer = playerIndex === rootPlayerIndex;
    const weights = isRootPlayer ? XY_GTO_A6 : profile.opponentWeights;
    const temperature = isRootPlayer ? 0.08 : profile.opponentTemperature;
    const placements = enumeratePlacements(state, playerIndex, weights);
    const shortlist = placements.slice(0, 4);
    let selected = shortlist[0];
    if (temperature > 0 && shortlist.length > 1) {
        const best = shortlist[0].gtoScore;
        const worst = shortlist[shortlist.length - 1].gtoScore;
        const scale = Math.max(0.25, best - worst);
        const probabilities = shortlist.map(move => Math.exp(
            (move.gtoScore - best) / (scale * temperature),
        ));
        const total = probabilities.reduce((sum, value) => sum + value, 0);
        let target = random() * total;
        for (let index = 0; index < shortlist.length; index++) {
            target -= probabilities[index];
            if (target <= 0) {
                selected = shortlist[index];
                break;
            }
        }
    }
    const card = state.players[playerIndex].hand.find(candidate => candidate.id === selected.cardId);
    return {
        cardId: selected.cardId,
        colIndex: selected.colIndex,
        isHidden: card
            ? random() < getGtoHideProbability(state, playerIndex, card, selected.colIndex, weights)
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
