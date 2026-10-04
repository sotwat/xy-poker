import { readFileSync, writeFileSync } from 'node:fs';
import { findForcedWinPlan } from '../src/logic/forcedWin';
import type { GameState } from '../src/logic/types';

const load = (name: string) => JSON.parse(readFileSync(new URL(`../src/logic/fixtures/${name}.json`, import.meta.url), 'utf8')).state as GameState;
const joint = load('joint-forced-win'), capped = structuredClone(joint);
const publicRow = capped.players[1 - capped.currentPlayerIndex].board.find(row => row.some(card => card && !card.isHidden))!;
publicRow[publicRow.findIndex(card => card && !card.isHidden)]!.isHidden = true;
const cases = [
    { name: 'independent-three-move', state: load('forced-win') },
    { name: 'independent-holdout', state: load('forced-win-holdout') },
    { name: 'joint-three-unknown', state: joint },
    { name: 'four-unknown-cap', state: capped },
    { name: 'final-move-out-of-scope', state: load('endgame') },
];
const rows = [];
for (const entry of cases) {
    const actor = entry.state.currentPlayerIndex as 0 | 1;
    for (let warmup = 0; warmup < 2; warmup++) findForcedWinPlan(entry.state, actor, performance.now() + 100);
    for (const budgetMs of [1, 5, 10, 25, 50, 100]) {
        const elapsed = [];
        let certified = 0, jointCertified = 0;
        for (let repeat = 0; repeat < 10; repeat++) {
            const started = performance.now();
            const plan = findForcedWinPlan(entry.state, actor, started + budgetMs);
            elapsed.push(performance.now() - started);
            if (plan) {
                certified++;
                if (plan.boundMethod === 'joint-completions') jointCertified++;
            }
        }
        elapsed.sort((a, b) => a - b);
        rows.push({ fixture: entry.name, budgetMs, repetitions: elapsed.length, certified, jointCertified,
            medianMs: elapsed[5], p95Ms: elapsed[9], maximumMs: elapsed[9], elapsedMs: elapsed });
    }
}
const result = { generatedAt: new Date().toISOString(), rows,
    scope: 'Fixed fixture timing and completed-certificate counts; not win rates or proof nonexistence.',
    limits: ['Wall-clock deadlines are cooperative; OS scheduling and GC may overrun a deadline before the next check.',
        'Measurements depend on warmup, machine load, and fixture selection. The caller includes independent bounds first.',
        'World and X-hand caches are local to one call; no partial cache is reused across calls.'] };
const outputPath = process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? 'gto_certificate_timing.json';
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
