let enabled = false;
let metrics = { calls: 0, changedCalls: 0, retainedChanges: 0 };
export function setPriorPruningEnabled(value: boolean) {
    enabled = value; metrics = { calls: 0, changedCalls: 0, retainedChanges: 0 };
}
export function priorPruningEnabled() { return enabled; }
export function priorPruningMetrics() { return { ...metrics }; }
export function selectPriorFinalists(active: number[], normalizedOutcomes: number[], normalizedPriors: number[], priorWeight: number, limit: number) {
    const old = new Set([...active].sort((a, b) => normalizedOutcomes[b] - normalizedOutcomes[a]).slice(0, limit));
    const blended = (i: number) => normalizedOutcomes[i] * (1 - priorWeight) + normalizedPriors[i] * priorWeight;
    const selected = [...active].sort((a, b) => blended(b) - blended(a)).slice(0, limit);
    const changed = selected.filter(i => !old.has(i)).length;
    metrics.calls++; metrics.changedCalls += Number(changed > 0); metrics.retainedChanges += changed;
    return selected;
}
