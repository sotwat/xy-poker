export const DIAGNOSTIC_INSTRUMENTED = false;
export class WorkLimit extends Error {}
let active = false;
let remaining = 0;
let used = 0;
let site = '';
export function resetWork(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid work limit');
    remaining = limit; used = 0; site = '';
}
export function diagnosticTick(location: string) {
    if (!active) return;
    if (remaining === 0) { site = location; throw new WorkLimit('Diagnostic work limit'); }
    remaining--; used++;
}
export function workState() { return { used, remaining, exhaustedAt: site }; }
export function boundedProof<T>(limit: number, solve: () => T) {
    if (active) throw new Error('Nested proof budget');
    resetWork(limit); active = true;
    try { return { status: 'returned' as const, result: solve(), ...workState() }; }
    catch (error) {
        if (!(error instanceof WorkLimit)) throw error;
        return { status: 'incomplete' as const, result: null, ...workState() };
    } finally { active = false; }
}
