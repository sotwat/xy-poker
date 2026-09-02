import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from './deck';
import type { GameRecordDataV3, GameRecordSkillTier } from './gameRecord';
import { buildWeightedHumanMoveCorpus } from './trainingCorpus';

function createRecord(id: string, skillTier: GameRecordSkillTier, sampleWeight: number): GameRecordDataV3 {
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
        winner: 'p1',
        scores: [10, 5],
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

test('builds a trusted corpus where strong human moves outweigh weak human moves', () => {
    const strong = createRecord('00000000-0000-4000-8000-000000000011', 'expert', 2.37);
    const weak = createRecord('00000000-0000-4000-8000-000000000012', 'weak', 0.42);
    const samples = buildWeightedHumanMoveCorpus([strong, weak, { forged: true }]);

    assert.equal(samples.length, 30);
    assert.equal(samples.filter(sample => sample.recordId === strong.id).length, 15);
    assert.equal(samples.filter(sample => sample.recordId === weak.id).length, 15);
    assert.ok(samples.find(sample => sample.recordId === strong.id)!.sampleWeight
        > samples.find(sample => sample.recordId === weak.id)!.sampleWeight);
    assert.ok(samples.every(sample => sample.playerIndex === 0));
});
