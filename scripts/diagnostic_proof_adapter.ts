import { boundedProof, DIAGNOSTIC_INSTRUMENTED } from './diagnostic_work_budget';
import { solveFinalMove } from '../src/logic/endgame';
import { findForcedWinPlan } from '../src/logic/forcedWin';
import type { GameState } from '../src/logic/types';
let limit = 0;
const calls: Array<{ method: string; status: string; used: number; exhaustedAt: string; hasResult: boolean }> = [];
export function configureProofs(value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 20_000_000) throw new Error('Invalid diagnostic proof cap');
    limit = value; calls.length = 0;
}
export function proofCalls() { return structuredClone(calls); }
function guard<T>(method: string, solve: () => T) {
    if (!DIAGNOSTIC_INSTRUMENTED) throw new Error('Proof source is not instrumented');
    const result = boundedProof(limit, solve);
    if (result.status === 'returned' && result.used === 0) throw new Error('Proof source is not instrumented');
    calls.push({ method, status: result.status, used: result.used, exhaustedAt: result.exhaustedAt, hasResult: Boolean(result.result) });
    return result.result;
}
export function boundedFinalMove(state: GameState, actor: 0 | 1, deadline: number, response = false) {
    return guard(response ? 'responses' : 'final', () => solveFinalMove(state, actor, deadline, response));
}
export function boundedForcedWinPlan(state: GameState, actor: 0 | 1, deadline: number) {
    return guard('forced', () => findForcedWinPlan(state, actor, deadline));
}
