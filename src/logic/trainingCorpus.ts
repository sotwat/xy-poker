import { getGtoHideProbability, scoreGtoMove } from './gtoPolicy';
import {
    isGameRecordData,
    type GameRecordData,
    type GameRecordDataV2,
    type GameRecordDataV3,
    type GameRecordSkillTier,
} from './gameRecord';
import type { Card, GameState, PlayerState } from './types';

export interface WeightedHumanMoveSample {
    recordId: string;
    ply: number;
    playerIndex: 0 | 1;
    cardId: string;
    column: number;
    row: number;
    isHidden: boolean;
    dice: number[];
    result: 'win' | 'loss' | 'draw';
    skillTier: GameRecordSkillTier;
    qualityScore: number;
    policyAgreement: number;
    performanceScore: number;
    sampleWeight: number;
    thought?: string;
}

interface AssessedMove {
    move: GameRecordDataV2['moves'][number] | GameRecordDataV3['moves'][number];
    policyAgreement: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const emptyBoard = () => Array.from({ length: 3 }, () => Array<Card | null>(5).fill(null));

function createReplayPlayer(id: string, hand: Card[], dice: number[]): PlayerState {
    return {
        id,
        hand: hand.map(card => ({ ...card })),
        board: emptyBoard(),
        dice: [...dice],
        score: 0,
        hiddenCardsCount: 0,
        bonusesClaimed: 0,
    };
}

function createReplayState(record: GameRecordDataV2 | GameRecordDataV3): GameState {
    return {
        players: [
            createReplayPlayer('p1', record.initialHands[0], record.dice),
            createReplayPlayer('p2', record.initialHands[1], record.dice),
        ],
        currentPlayerIndex: record.moves[0].playerIndex,
        phase: 'playing',
        deck: [],
        turnCount: 1,
        winner: null,
    };
}

function placementAgreement(state: GameState, playerIndex: 0 | 1, chosenCard: Card, column: number): number {
    const scores: number[] = [];
    let chosenScore = Number.NEGATIVE_INFINITY;
    for (const card of state.players[playerIndex].hand) {
        for (let candidateColumn = 0; candidateColumn < 5; candidateColumn += 1) {
            if (state.players[playerIndex].board[2][candidateColumn] !== null) continue;
            const score = scoreGtoMove(state, playerIndex, card, candidateColumn);
            if (!Number.isFinite(score)) continue;
            scores.push(score);
            if (card.id === chosenCard.id && candidateColumn === column) chosenScore = score;
        }
    }
    if (!Number.isFinite(chosenScore) || scores.length === 0) return 0;

    const best = Math.max(...scores);
    const worst = Math.min(...scores);
    const normalizedRegret = best === worst ? 0 : (best - chosenScore) / (best - worst);
    const betterMoves = scores.filter(score => score > chosenScore + 1e-9).length;
    const percentile = scores.length === 1 ? 1 : 1 - betterMoves / (scores.length - 1);
    return clamp01((1 - normalizedRegret) * 0.65 + percentile * 0.35);
}

function assessMove(state: GameState, move: AssessedMove['move']): number {
    const playerIndex = move.playerIndex;
    const card = state.players[playerIndex].hand.find(candidate => candidate.id === move.card.id);
    if (!card) return 0;
    const placement = placementAgreement(state, playerIndex, card, move.column);
    const hideProbability = getGtoHideProbability(state, playerIndex, card, move.column);
    const hideAgreement = move.card.isHidden ? hideProbability : 1 - hideProbability;
    return clamp01(placement * 0.9 + hideAgreement * 0.1);
}

function applyRecordedMove(state: GameState, move: AssessedMove['move']): boolean {
    const player = state.players[move.playerIndex];
    const cardIndex = player.hand.findIndex(card => card.id === move.card.id);
    if (cardIndex < 0 || player.board[move.row][move.column] !== null) return false;

    player.hand.splice(cardIndex, 1);
    player.board[move.row][move.column] = { ...move.card };
    if (move.card.isHidden) player.hiddenCardsCount += 1;
    if (move.row === 2 && state.players[1 - move.playerIndex].board[2][move.column] === null) {
        player.bonusesClaimed += 1;
    }
    player.hand.push(...move.drawnCards.map(card => ({ ...card })));
    state.currentPlayerIndex = (1 - move.playerIndex) as 0 | 1;
    state.turnCount += 1;
    return true;
}

function performanceScore(record: GameRecordData): number {
    // Online results lack a trustworthy opponent-strength baseline. They remain
    // neutral until gameplay-derived opponent calibration exists.
    if (record.mode !== 'bot') return 0.5;
    const viewer = record.viewerPlayerIndex;
    const scoreDifference = record.scores[viewer] - record.scores[1 - viewer];
    const margin = clamp01(0.5 + scoreDifference / 40);
    const result = record.winner === 'draw'
        ? 0.65
        : record.winner === `p${viewer + 1}` ? 1 : 0;
    return clamp01(result * 0.55 + margin * 0.45);
}

function tierFor(qualityScore: number): GameRecordSkillTier {
    if (qualityScore >= 0.82) return 'expert';
    if (qualityScore >= 0.68) return 'strong';
    if (qualityScore >= 0.45) return 'developing';
    return 'weak';
}

function assessRecord(record: GameRecordDataV2 | GameRecordDataV3): AssessedMove[] | null {
    const state = createReplayState(record);
    const assessed: AssessedMove[] = [];
    for (const move of record.moves) {
        if (move.playerIndex !== state.currentPlayerIndex) return null;
        assessed.push({ move, policyAgreement: assessMove(state, move) });
        if (!applyRecordedMove(state, move)) return null;
    }
    return assessed;
}

/**
 * Builds a trusted imitation corpus from server-enriched records. Ratings and
 * account labels are deliberately ignored. Each decision is weighted from its
 * reproducible board-state agreement with the reference policy and, for bot
 * matches only, the player's observed result and score margin.
 */
export function buildWeightedHumanMoveCorpus(values: unknown[]): WeightedHumanMoveSample[] {
    const records = new Map<string, GameRecordDataV2 | GameRecordDataV3>();
    for (const value of values) {
        if (!isGameRecordData(value) || !value.trainingMetadata || value.schemaVersion === 1) continue;
        records.set(value.id, value);
    }

    return [...records.values()].flatMap(record => {
        const assessed = assessRecord(record);
        if (!assessed) return [];
        const viewerWinner = record.winner === 'draw'
            ? 'draw'
            : record.winner === `p${record.viewerPlayerIndex + 1}` ? 'win' : 'loss';
        const observedPerformance = performanceScore(record);

        return assessed
            .filter(sample => sample.move.playerIndex === record.viewerPlayerIndex)
            .map(sample => {
                // Agreement is evidence, not proof of optimality. Keeping a
                // substantial outcome component allows successful human
                // deviations from the current AI to enter the corpus.
                const qualityScore = clamp01(sample.policyAgreement * 0.65 + observedPerformance * 0.35);
                const sampleWeight = 0.4 + qualityScore * 1.4;
                const thought = record.schemaVersion === 3
                    ? record.moves[sample.move.ply - 1].thought
                    : undefined;
                return {
                    recordId: record.id,
                    ply: sample.move.ply,
                    playerIndex: sample.move.playerIndex,
                    cardId: sample.move.card.id,
                    column: sample.move.column,
                    row: sample.move.row,
                    isHidden: sample.move.card.isHidden === true,
                    dice: [...record.dice],
                    result: viewerWinner,
                    skillTier: tierFor(qualityScore),
                    qualityScore: Number(qualityScore.toFixed(4)),
                    policyAgreement: Number(sample.policyAgreement.toFixed(4)),
                    performanceScore: Number(observedPerformance.toFixed(4)),
                    sampleWeight: Number(sampleWeight.toFixed(4)),
                    ...(thought ? { thought } : {}),
                };
            });
    });
}
