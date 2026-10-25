import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDeck } from '../src/logic/deck';
import { isValidGameState } from '../src/logic/game';
import type { GameState } from '../src/logic/types';
const generated = (name: string) => import(pathToFileURL(resolve(`.selfplay/bounded-proofs-20261025/${name}.ts`)).href);
const ai = await generated('ai'), adapter = await generated('adapter');
const ids = new Map(createDeck().map((card, i) => [card.id, i]));
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    const random = Math.random, clock = Object.getOwnPropertyDescriptor(performance, 'now');
    try {
        const request = JSON.parse(line) as { state: GameState; seed: number; proofLimit: number; generation?: 'a7' | 'a9' };
        if (!isValidGameState(request.state) || request.state.phase !== 'playing') throw new Error('Invalid playing state');
        let value = request.seed >>> 0;
        Math.random = () => { value += 0x6D2B79F5; let t = Math.imul(value ^ (value >>> 15), 1 | value); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        Object.defineProperty(performance, 'now', { configurable: true, value: () => 0 });
        adapter.configureProofs(request.proofLimit); ai.diagnosticReset();
        const started = process.hrtime.bigint(), cpu = process.cpuUsage();
        const move = ai.getBestMove(request.state, request.state.currentPlayerIndex, { ...ai.DEFAULT_AI_PARAMS, policyGeneration: request.generation ?? 'a9' });
        const index = ids.get(move.cardId); if (index === undefined) throw new Error('Unknown card');
        const used = process.cpuUsage(cpu);
        process.stdout.write(JSON.stringify({ action: index * 10 + move.colIndex * 2 + Number(move.isHidden), move,
            baseline: ai.getDiagnosticBaseline(), proofs: adapter.proofCalls(), diagnostics: ai.getLastAiDecisionDiagnostics(),
            cpuMs: (used.user + used.system) / 1000, actualElapsedMs: Number(process.hrtime.bigint() - started) / 1e6 }) + '\n');
    } catch (error) { process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + '\n'); }
    finally { Math.random = random; if (clock) Object.defineProperty(performance, 'now', clock); else Reflect.deleteProperty(performance, 'now'); }
}
