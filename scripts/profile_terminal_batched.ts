import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as original from './terminal_reply';
import * as batched from './terminal_reply_batched';
import { terminalState } from './terminal_reply_fixture';

const output = process.argv.find(a => a.startsWith('--output='))?.slice(9) ?? '/tmp/xy-terminal-batched-profile.json';
const seed = 1005101001, count = 400, rounds = 8;
const states = Array.from({ length: count }, (_, i) => terminalState(seed + i));
function run(api: typeof original | typeof batched) {
    let worlds = 0;
    const choices: string[] = [];
    const start = performance.now();
    for (const state of states) {
        const actor = state.currentPlayerIndex as 0 | 1, own = state.players[actor];
        const baseline = { cardId: own.hand[0].id, colIndex: own.board[2].findIndex(c => !c), isHidden: false };
        api.setTerminalReplyEnabled(true);
        choices.push(api.chooseTerminalReply(state, actor, baseline).cardId);
        worlds += api.terminalReplyMetrics().worlds;
    }
    return { elapsedMs: performance.now() - start, choices, worlds };
}
run(original); run(batched);
const rows = Array.from({ length: rounds }, (_, round) => {
    const order = round % 2 ? [batched, original] : [original, batched];
    const values = order.map(run), old = values[round % 2 ? 1 : 0], next = values[round % 2 ? 0 : 1];
    assert.deepEqual(old.choices, next.choices); assert.equal(old.worlds, next.worlds);
    return { round, originalFirst: round % 2 === 0, originalMs: old.elapsedMs, batchedMs: next.elapsedMs, worlds: next.worlds, choices: next.choices };
});
const oldMs = rows.reduce((s, r) => s + r.originalMs, 0), nextMs = rows.reduce((s, r) => s + r.batchedMs, 0);
const files = ['scripts/profile_terminal_batched.ts', 'scripts/terminal_reply_fixture.ts', 'scripts/terminal_reply.ts', 'scripts/terminal_reply_batched.ts', 'src/logic/evaluation.ts', 'src/logic/scoring.ts'];
const result = { seed, count, rounds, innerSamples: 8, cache: 'reset before each call', warmupPasses: 1, protocol: 'Alternating implementation order, fixed legal states, unlimited time; local microbenchmark only, no strength claim', sourceHashes: Object.fromEntries(files.map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')])), rows, totalOriginalMs: oldMs, totalBatchedMs: nextMs, timeRatio: nextMs / oldMs };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ count, rounds, totalOriginalMs: oldMs, totalBatchedMs: nextMs, timeRatio: result.timeRatio }));
