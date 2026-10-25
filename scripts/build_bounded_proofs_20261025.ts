import ts from 'typescript';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('.selfplay/bounded-proofs-20261025');
mkdirSync(output, { recursive: true });
const files = ['endgame', 'forcedWin', 'jointForcedWin', 'sharedCardProof', 'certificateKnowledge',
    'deck', 'evaluation', 'scoring', 'types'];
const manifest: Record<string, { sha256: string; functionSites: number; loopSites: number }> = {};
for (const name of files) {
    const path = `src/logic/${name}.ts`, source = readFileSync(path, 'utf8');
    const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    let functionSites = 0, loopSites = 0;
    const tick = (node: ts.Node) => ts.factory.createExpressionStatement(ts.factory.createCallExpression(
        ts.factory.createIdentifier('diagnosticTick'), undefined,
        [ts.factory.createStringLiteral(`${name}:${parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1}`)]));
    const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
        const visit: ts.Visitor = original => {
            const node = ts.visitEachChild(original, visit, context);
            if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
                functionSites++;
                return ts.factory.updateArrowFunction(node, node.modifiers, node.typeParameters, node.parameters,
                    node.type, node.equalsGreaterThanToken, ts.factory.createBlock([tick(original), ts.factory.createReturnStatement(node.body)], true));
            }
            const parent = original.parent;
            const functionBody = ts.isBlock(original) && ts.isFunctionLike(parent) && 'body' in parent && parent.body === original;
            const loopBody = ts.isStatement(original) && ts.isIterationStatement(parent, false) && parent.statement === original;
            if (functionBody || loopBody) {
                if (functionBody) functionSites++;
                if (loopBody) loopSites++;
                const statements = ts.isBlock(node) ? node.statements : [node as ts.Statement];
                return ts.factory.createBlock([tick(original), ...statements], true);
            }
            return node;
        };
        return sourceFile => ts.visitNode(sourceFile, visit) as ts.SourceFile;
    };
    const transformed = ts.transform(parsed, [transformer]);
    const code = ts.createPrinter().printFile(transformed.transformed[0]);
    writeFileSync(`${output}/${name}.ts`, `${functionSites + loopSites ? "import { diagnosticTick } from './budget';\n" : ''}${code}`);
    transformed.dispose();
    manifest[path] = { sha256: createHash('sha256').update(source).digest('hex'), functionSites, loopSites };
}
writeFileSync(`${output}/budget.ts`, readFileSync('scripts/diagnostic_work_budget.ts', 'utf8').replace('DIAGNOSTIC_INSTRUMENTED = false', 'DIAGNOSTIC_INSTRUMENTED = true'));
writeFileSync(`${output}/manifest.json`, JSON.stringify({ unit: 'function entry or loop iteration; not CPU instructions or nodes', files: manifest }, null, 2) + '\n');
console.log(JSON.stringify(manifest));
