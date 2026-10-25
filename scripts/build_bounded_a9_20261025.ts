import './build_bounded_proofs_20261025';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const output = '.selfplay/bounded-proofs-20261025';
const hashes: Record<string, string> = {};
for (const name of ['game', 'gtoPolicy', 'ai']) {
    const path = `src/logic/${name}.ts`, source = readFileSync(path, 'utf8');
    hashes[path] = createHash('sha256').update(source).digest('hex');
    let code = source;
    if (name === 'ai') {
        const replacements = [
            ["import { certifiedEndgameReplacement, solveFinalMove } from './endgame';", "import { certifiedEndgameReplacement } from './endgame';\nimport { boundedFinalMove as solveFinalMove, boundedForcedWinPlan as findForcedWinPlan } from './adapter';"],
            ['continueForcedWinPlan, findForcedWinPlan, type ForcedWinPlan', 'continueForcedWinPlan, type ForcedWinPlan'],
            ["    const exact = params.policyGeneration", "    diagnosticBaseline = { cardId: selected.cardId, colIndex: selected.colIndex, isHidden: selected.isHidden };\n    const exact = params.policyGeneration"],
        ];
        for (const [from, to] of replacements) {
            if (code.split(from).length !== 2) throw new Error(`Ambiguous/missing hook: ${from}`);
            code = code.replace(from, to);
        }
        code += '\nlet diagnosticBaseline: { cardId: string; colIndex: number; isHidden: boolean } | null = null;\nexport function diagnosticReset() { delete forcedWinPlans[0]; delete forcedWinPlans[1]; diagnosticBaseline = null; }\nexport function getDiagnosticBaseline() { return diagnosticBaseline; }\n';
    }
    writeFileSync(`${output}/${name}.ts`, code);
}
const adapter = readFileSync('scripts/diagnostic_proof_adapter.ts', 'utf8')
    .replace("'./diagnostic_work_budget'", "'./budget'")
    .replaceAll("'../src/logic/", "'./");
writeFileSync(`${output}/adapter.ts`, adapter);
writeFileSync(`${output}/ai-manifest.json`, JSON.stringify({ hashes, capScope: 'Per proof invocation; at most final + response + forced calls',
    clock: 'Frozen for diagnostic64-sample comparisons; not production A9', plans: 'Explicitly reset between diagnostic decisions' }, null, 2) + '\n');
