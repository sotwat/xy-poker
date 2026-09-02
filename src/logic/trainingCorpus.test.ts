import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from './deck';
import type { GameRecordDataV3, GameRecordSkillTier } from './gameRecord';
import { buildWeightedHumanMoveCorpus } from './trainingCorpus';

function createRecord(
    id: string,
    skillTier: GameRecordSkillTier,
    sampleWeight: number,
    result: 'win' | 'loss' = 'win',
): GameRecordDataV3 {
    const deck = createDeck();
    const initialHands = [deck.slice(0, 4), deck.slice(4, 8)] as [typeof deck, typeof deck];
    const hands = initialHands.map(hand => hand.map(card => ({ ...card })));
    const moveCounts = [0, 0];
    let drawIndex = 8;
    return {
        schemaVersion: 3,
        id,
        startedAt: '2026-09-03T00:00:00.000Z',
        completedAt: '2026-09-03T00:10:00.000Z',
        mode: 'bot',
        viewerPlayerIndex: 0,
        playerNames: ['Human', 'AI'],
        dice: [6, 5, 4, 3, 2],
        winner: result === 'win' ? 'p1' : 'p2',
        scores: result === 'win' ? [18, 4] : [4, 18],
        bonuses: [2, 1],
        initialHands,
        moves: Array.from({ length: 30 }, (_, index) => {
            const playerIndex = index % 2 as 0 | 1;
            const playerMove = moveCounts[playerIndex]++;
            const card = hands[playerIndex].shift()!;
            const drawnCards = [{ ...deck[drawIndex++] }];
            hands[playerIndex].push(...drawnCards);
            return {
                ply: index + 1,
                playerIndex,
                card: { ...card, isHidden: false },
                column: Math.floor(playerMove / 3),
                row: playerMove % 3,
                drawnCards,
            };
        }),
        trainingMetadata: {
            schemaVersion: 1,
            source: 'server',
            playerRating: skillTier === 'expert' ? 2000 : 1000,
            playerGamesPlayed: 200,
            playerWins: 100,
            playerWinRate: 0.5,
            ratingConfidence: 0.9933,
            effectiveRating: skillTier === 'expert' ? 1997 : 1003,
            sampleWeight,
            skillTier,
            aiPolicyId: 'xy-gto-a7',
            aiThinkTimeMs: 1000,
        },
    };
}

test('derives corpus weights from gameplay and ignores legacy ratings', () => {
    const highLegacyRating = createRecord('00000000-0000-4000-8000-000000000011', 'expert', 4, 'loss');
    const lowLegacyRating = createRecord('00000000-0000-4000-8000-000000000012', 'weak', 0.25, 'loss');
    const winningRecord = createRecord('00000000-0000-4000-8000-000000000013', 'weak', 0.25, 'win');
    const samples = buildWeightedHumanMoveCorpus([highLegacyRating, lowLegacyRating, winningRecord, { forged: true }]);

    assert.equal(samples.length, 45);
    const highLegacySamples = samples.filter(sample => sample.recordId === highLegacyRating.id);
    const lowLegacySamples = samples.filter(sample => sample.recordId === lowLegacyRating.id);
    const winningSamples = samples.filter(sample => sample.recordId === winningRecord.id);
    assert.equal(highLegacySamples.length, 15);
    assert.deepEqual(
        highLegacySamples.map(sample => sample.sampleWeight),
        lowLegacySamples.map(sample => sample.sampleWeight),
    );
    assert.ok(winningSamples[0].sampleWeight > highLegacySamples[0].sampleWeight);
    assert.ok(samples.every(sample => sample.qualityScore >= 0 && sample.qualityScore <= 1));
    assert.ok(samples.every(sample => sample.policyAgreement >= 0 && sample.policyAgreement <= 1));
    assert.ok(samples.every(sample => sample.playerIndex === 0));
});
