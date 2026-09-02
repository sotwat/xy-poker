import { readFile } from 'node:fs/promises';
import { buildWeightedHumanMoveCorpus } from '../src/logic/trainingCorpus';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: npm run prepare:training -- <records.json>');

const raw = JSON.parse(await readFile(sourcePath, 'utf8')) as unknown;
const values = Array.isArray(raw) ? raw.map(value => {
    if (value && typeof value === 'object' && 'record_data' in value) {
        return (value as { record_data: unknown }).record_data;
    }
    return value;
}) : [];
const samples = buildWeightedHumanMoveCorpus(values);
const tierSummary = Object.fromEntries(['weak', 'developing', 'strong', 'expert'].map(tier => {
    const matching = samples.filter(sample => sample.skillTier === tier);
    return [tier, {
        moves: matching.length,
        weightedMoves: Number(matching.reduce((sum, sample) => sum + sample.sampleWeight, 0).toFixed(4)),
    }];
}));

process.stdout.write(`${JSON.stringify({
    trustedRecords: new Set(samples.map(sample => sample.recordId)).size,
    moves: samples.length,
    weightedMoves: Number(samples.reduce((sum, sample) => sum + sample.sampleWeight, 0).toFixed(4)),
    tiers: tierSummary,
    samples,
}, null, 2)}\n`);
