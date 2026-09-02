import {
    isGameRecordData,
    type GameRecordData,
    type GameRecordSkillTier,
} from './gameRecord';

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
    effectiveRating: number;
    sampleWeight: number;
    thought?: string;
}

/**
 * Builds a trusted imitation corpus from server-enriched records. Only the
 * authenticated viewer's own decisions are included; opponent and AI moves
 * are context, never mislabeled as that player's strategy.
 */
export function buildWeightedHumanMoveCorpus(values: unknown[]): WeightedHumanMoveSample[] {
    const records = new Map<string, GameRecordData>();
    for (const value of values) {
        if (!isGameRecordData(value) || !value.trainingMetadata) continue;
        records.set(value.id, value);
    }

    return [...records.values()].flatMap(record => {
        const metadata = record.trainingMetadata!;
        const viewerWinner = record.winner === 'draw'
            ? 'draw'
            : record.winner === `p${record.viewerPlayerIndex + 1}` ? 'win' : 'loss';
        return record.moves
            .filter(move => move.playerIndex === record.viewerPlayerIndex)
            .map(move => {
                const thought = record.schemaVersion === 3
                    ? record.moves[move.ply - 1].thought
                    : undefined;
                return {
                    recordId: record.id,
                    ply: move.ply,
                    playerIndex: move.playerIndex,
                    cardId: move.card.id,
                    column: move.column,
                    row: move.row,
                    isHidden: move.card.isHidden === true,
                    dice: [...record.dice],
                    result: viewerWinner,
                    skillTier: metadata.skillTier,
                    effectiveRating: metadata.effectiveRating,
                    sampleWeight: metadata.sampleWeight,
                    ...(thought ? { thought } : {}),
                };
            });
    });
}
