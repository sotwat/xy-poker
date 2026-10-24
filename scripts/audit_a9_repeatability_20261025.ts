import { createInterface } from 'node:readline';
import { createDeck } from '../src/logic/deck';
import { DEFAULT_AI_PARAMS, getBestMove, getLastAiDecisionDiagnostics } from '../src/logic/ai';
import { isValidGameState } from '../src/logic/game';
import type { GameState } from '../src/logic/types';

const ids = new Map(createDeck().map((card, index) => [card.id, index]));
function randomGenerator(seed: number) {
    let value = seed >>> 0;
    return () => {
        value += 0x6D2B79F5;
        let t = Math.imul(value ^ (value >>> 15), 1 | value);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    try {
        const request = JSON.parse(line) as { state: GameState; seed: number; frozenClock: boolean };
        if (!isValidGameState(request.state) || request.state.phase !== 'playing') throw new Error('Invalid playing state');
        const originalRandom = Math.random;
        const ownNow = Object.getOwnPropertyDescriptor(performance, 'now');
        const started = process.hrtime.bigint();
        try {
            Math.random = randomGenerator(request.seed);
            if (request.frozenClock) Object.defineProperty(performance, 'now', { configurable: true, value: () => 0 });
            const move = getBestMove(request.state, request.state.currentPlayerIndex, { ...DEFAULT_AI_PARAMS });
            const cardIndex = ids.get(move.cardId);
            if (cardIndex === undefined) throw new Error('Unknown card');
            const diagnostics = getLastAiDecisionDiagnostics();
            process.stdout.write(JSON.stringify({ action: cardIndex * 10 + move.colIndex * 2 + Number(move.isHidden),
                diagnostics, actualElapsedMs: Number(process.hrtime.bigint() - started) / 1e6 }) + '\n');
        } finally {
            Math.random = originalRandom;
            if (request.frozenClock) {
                if (ownNow) Object.defineProperty(performance, 'now', ownNow);
                else Reflect.deleteProperty(performance, 'now');
            }
        }
    } catch (error) {
        process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + '\n');
    }
}
