import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { scoreGtoMove, getGtoHideProbability, XY_GTO_A7, XY_GTO_A6, XY_GTO_A4, XY_GTO_A3 } from '../src/logic/gtoPolicy';
import type { GameState } from '../src/logic/types';

const startedUtc = new Date().toISOString();
const outerDeadline = Date.parse(process.argv[2]);
assert.ok(Number.isFinite(outerDeadline) && Date.now() < outerDeadline, 'absolute deadline expired');
const deadline = Math.min(outerDeadline, Date.now() + 120000);
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const ast = ts.createSourceFile('ai.ts', readFileSync('src/logic/ai.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['sampleInformationSet', 'cloneGameState', 'getRemainingDeck', 'getKnownCards', 'shuffleInPlace', 'seededRandom', 'selectRolloutMove', 'enumeratePlacements'];
const code = names.map(name => {
    const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(node); return node.getText(ast).replace(/^export /, '');
}).join('\n');
type Move = { cardId: string; colIndex: number; isHidden: boolean };
type Profile = { opponentWeights: typeof XY_GTO_A7; opponentTemperature: number };
const api = runInNewContext(ts.transpileModule(`${code}\n({sampleInformationSet,seededRandom,selectRolloutMove});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None },
}).outputText, { structuredClone, createDeck, scoreGtoMove, getGtoHideProbability, XY_GTO_A7 }, { timeout: 1000 }) as {
    sampleInformationSet: (s: GameState, p: number, seed: number) => GameState;
    seededRandom: (seed: number) => () => number;
    selectRolloutMove: (s: GameState, p: number, root: number, profile: Profile, weights: typeof XY_GTO_A7, rng: () => number) => Move;
};

const stages = [6];
const profiles = [XY_GTO_A7, XY_GTO_A6, XY_GTO_A4, XY_GTO_A3];
const paths = ['scripts/diagnose_infoset_concealment.ts', ...['ai', 'game', 'deck', 'gtoPolicy', 'evaluation', 'scoring', 'types'].map(p => `src/logic/${p}.ts`)];
const sourceHashes = Object.fromEntries(paths.map(p => [p, sha(p)]));
function conserved(s: GameState) {
    const cards = [...s.deck, ...s.players.flatMap(p => [...p.hand, ...p.board.flat().filter(c => c !== null)])];
    assert.equal(cards.length, 52); assert.equal(new Set(cards.map(c => c.id)).size, 52);
}
function fixture(seed: number) {
    const random = api.seededRandom(seed), deck = createDeck();
    for (let i = 51; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const dice = Array.from({ length: 5 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => b - a);
    let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck: deck, initialDice: dice, startingPlayer: 0 } });
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: 0 } });
    const moves: Move[] = [], snapshots: { ply: number; state: GameState }[] = [];
    for (let turn = 0; turn < 6; turn++) {
        const own = state.players[state.currentPlayerIndex];
        const cols = own.board[2].flatMap((c, i) => c ? [] : [i]);
        const colIndex = cols[Math.floor(random() * cols.length)];
        const move = { cardId: own.hand[Math.floor(random() * own.hand.length)].id, colIndex,
            isHidden: random() < 0.3 && own.hiddenCardsCount < 3 && own.board.filter(r => r[colIndex]?.isHidden).length < 2 };
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        assert.notEqual(next, state); state = next; conserved(state); moves.push(move);
        if (stages.includes(turn + 1)) snapshots.push({ ply: turn + 1, state });
    }
    return { deck, dice, moves, snapshots };
}
function play(initial: GameState, first: Move, root: number, profile: number, worldSeed: number, ply: number) {
    let state = structuredClone(initial);
    const moves = [first];
    const before = state;
    state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: first });
    assert.notEqual(state, before);
    for (let turn = ply + 1; state.phase === 'playing'; turn++) {
        assert.ok(Date.now() < deadline, '60-second diagnostic deadline exceeded');
        assert.ok(turn < 30);
        const rng = api.seededRandom((worldSeed ^ Math.imul(turn, 2654435761) ^ 0x48494445) >>> 0);
        const move = api.selectRolloutMove(state, state.currentPlayerIndex, root,
            { opponentWeights: profiles[profile], opponentTemperature: 0 }, XY_GTO_A7, rng);
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        assert.notEqual(next, state); state = next; moves.push(move);
    }
    assert.equal(state.phase, 'scoring');
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    assert.equal(state.phase, 'ended');
    return { moves, winner: state.winner, scores: state.players.map(p => p.score),
        win: state.winner === 'draw' ? 0 : state.winner === `p${root + 1}` ? 1 : -1,
        margin: state.players[root].score - state.players[1 - root].score };
}

function observation(s: GameState, root: number) {
    return JSON.stringify({ own: s.players[root], other: { handCount: s.players[1-root].hand.length,
        board: s.players[1-root].board.map(r => r.map(c => c?.isHidden ? { isHidden: true } : c)),
        hiddenCardsCount: s.players[1-root].hiddenCardsCount }, dice: s.players.map(p=>p.dice), deckCount: s.deck.length,
        currentPlayerIndex: s.currentPlayerIndex, phase: s.phase });
}
function solve(matrix: number[][]) {
    const a = matrix[0], d = matrix[1].map((v,j) => v-a[j]);
    const candidates = [0,1];
    for (let i=0;i<4;i++) for (let j=i+1;j<4;j++) if (d[i]!==d[j]) {
        const p=(a[j]-a[i])/(d[i]-d[j]); if(p>=0 && p<=1) candidates.push(p);
    }
    const value=(p:number)=>Math.min(...a.map((v,j)=>v+p*d[j]));
    const best=Math.max(...candidates.map(value));
    const p=Math.min(...candidates.filter(p=>Math.abs(value(p)-best)<1e-12));
    const pureP=value(1)>value(0)?1:0;
    return {p,value:value(p),pureP,pureValue:value(pureP)};
}
assert.deepEqual(solve([[1,-1,1,-1],[-1,1,-1,1]]), {p:0.5,value:0,pureP:0,pureValue:-1});
assert.deepEqual(solve([[0,0,0,0],[0,0,0,0]]), {p:0,value:0,pureP:0,pureValue:0});
const groups=[];
let controls=0;
for(const [phase,seed] of [['selection',100521101],['confirmation',100521102]] as const){
    const fixtures=[],rows=[],excluded=[];
    for(let deal=0;deal<4;deal++){
        const dealSeed=(seed+Math.imul(deal,2654435761))>>>0;
        const f=fixture(dealSeed); fixtures.push({deal,dealSeed,deck:f.deck,dice:f.dice,moves:f.moves});
        for(const swap of [0,1]){
            const state=structuredClone(f.snapshots[0].state);
            if(swap){state.players=[{...state.players[1],id:'p1'},{...state.players[0],id:'p2'}];state.currentPlayerIndex=1;}
            const root=state.currentPlayerIndex;
            const first=api.selectRolloutMove(state,root,1-root,{opponentWeights:XY_GTO_A7,opponentTemperature:0},XY_GTO_A7,api.seededRandom(dealSeed^0x524f4c4c));
            const own=state.players[root];
            if(own.hiddenCardsCount>=3 || own.board.filter(r=>r[first.colIndex]?.isHidden).length>=2){excluded.push({deal,swap});continue;}
            const batches=[];
            for(const [split,salt] of [['fit',0x46495431],['heldout',0x54455354]] as const){
                const worlds: {worldSeed:number;state:GameState;arms:ReturnType<typeof play>[][]}[]=[];
                for(let wi=0;wi<16;wi++){
                    assert.ok(Date.now()<deadline,'diagnostic deadline expired');
                    const worldSeed=(dealSeed^salt^Math.imul(wi+1,2246822519))>>>0;
                    const world=api.sampleInformationSet(state,root,worldSeed); conserved(world);
                    assert.equal(observation(world,root),observation(state,root));
                    const arms=profiles.map((_,profile)=>[false,true].map(isHidden=>play(world,{...first,isHidden},root,profile,worldSeed,6)));
                    assert.deepEqual(play(world,{...first,isHidden:false},root,0,worldSeed,6),arms[0][0]);controls++;
                    worlds.push({worldSeed,state:world,arms});
                }
                const matrix=[0,1].map(arm=>profiles.map((_,profile)=>worlds.reduce((sum,w)=>sum+w.arms[profile][arm].win,0)/16));
                batches.push({split,worlds,matrix});
            }
            const fit=solve(batches[0].matrix), test=batches[1].matrix;
            const mixed=test[0].map((v,j)=>v+fit.p*(test[1][j]-v));
            const pure=test[fit.pureP];
            rows.push({deal,swap,root,state,first,batches,fit,heldout:{mixed,pure,minDelta:Math.min(...mixed)-Math.min(...pure),profileDelta:mixed.map((v,j)=>v-pure[j])}});
        }
    }
    groups.push({phase,seed,fixtures,excluded,rows});
}
for(const [p,h]of Object.entries(sourceHashes))assert.equal(sha(p),h);
writeFileSync('gto_infoset_concealment_20261021.json',JSON.stringify({kind:'root-observation-concealment-mixture-not-strength',startedUtc,endedUtc:new Date().toISOString(),outerDeadline:new Date(outerDeadline).toISOString(),sourceHashes,actualA9Games:0,controls,groups}),{flag:'wx'});
console.log(JSON.stringify(groups.map(g=>({phase:g.phase,excluded:g.excluded,rows:g.rows.map(r=>({deal:r.deal,swap:r.swap,fit:r.fit,heldout:r.heldout}))}))));
