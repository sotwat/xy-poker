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
const api = runInNewContext(ts.transpileModule(`${code}\n({sampleInformationSet,seededRandom,selectRolloutMove,enumeratePlacements});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None },
}).outputText, { structuredClone, createDeck, scoreGtoMove, getGtoHideProbability, XY_GTO_A7 }, { timeout: 1000 }) as {
    enumeratePlacements: (s:GameState,p:number,weights:typeof XY_GTO_A7)=>{cardId:string;colIndex:number;gtoScore:number}[];
    sampleInformationSet: (s: GameState, p: number, seed: number) => GameState;
    seededRandom: (seed: number) => () => number;
    selectRolloutMove: (s: GameState, p: number, root: number, profile: Profile, weights: typeof XY_GTO_A7, rng: () => number) => Move;
};

const stages = [6];
const profiles = [XY_GTO_A7, XY_GTO_A6, XY_GTO_A4, XY_GTO_A3];
const paths = ['scripts/diagnose_constrained_mixture.ts', ...['ai', 'game', 'deck', 'gtoPolicy', 'evaluation', 'scoring', 'types'].map(p => `src/logic/${p}.ts`)];
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
const groups=[];
let controls=0;
for(const [phase,seed] of [['selection',100521201],['confirmation',100521202]] as const){
    const fixtures=[],rows=[];
    for(let deal=0;deal<4;deal++){
        const dealSeed=(seed+Math.imul(deal,2654435761))>>>0;
        const f=fixture(dealSeed); fixtures.push({deal,dealSeed,deck:f.deck,dice:f.dice,moves:f.moves});
        for(const swap of [0,1]){
            const state=structuredClone(f.snapshots[0].state);
            if(swap){state.players=[{...state.players[1],id:'p1'},{...state.players[0],id:'p2'}];state.currentPlayerIndex=1;}
            const root=state.currentPlayerIndex;
            const first=structuredClone(api.selectRolloutMove(state,root,1-root,{opponentWeights:XY_GTO_A7,opponentTemperature:0},XY_GTO_A7,api.seededRandom(dealSeed^0x524f4c4c)));
            const own=state.players[root];
            const actions=api.enumeratePlacements(state,root,XY_GTO_A7).slice(0,2).flatMap(m=>{
                const modes=own.hiddenCardsCount<3 && own.board.filter(r=>r[m.colIndex]?.isHidden).length<2?[false,true]:[false];
                return modes.map(isHidden=>({cardId:m.cardId,colIndex:m.colIndex,isHidden}));
            });
            const baseline=actions.findIndex(a=>JSON.stringify(a)===JSON.stringify(first));
            assert.ok(baseline>=0);
            const batches=[];
            for(const [split,salt] of [['fit',0x46495431],['heldout',0x54455354]] as const){
                const worlds: {worldSeed:number;state:GameState;arms:ReturnType<typeof play>[][]}[]=[];
                for(let wi=0;wi<16;wi++){
                    assert.ok(Date.now()<deadline,'diagnostic deadline expired');
                    const worldSeed=(dealSeed^salt^Math.imul(wi+1,2246822519))>>>0;
                    const world=api.sampleInformationSet(state,root,worldSeed); conserved(world);
                    assert.equal(observation(world,root),observation(state,root));
                    const arms=profiles.map((_,profile)=>actions.map(action=>play(world,action,root,profile,worldSeed,6)));
                    assert.deepEqual(play(world,first,root,0,worldSeed,6),arms[0][baseline]);controls++;
                    worlds.push({worldSeed,state:world,arms});
                }
                const matrix=actions.map((_,arm)=>profiles.map((_,profile)=>worlds.reduce((sum,w)=>sum+w.arms[profile][arm].win,0)/16));
                batches.push({split,worlds,matrix});
            }
            rows.push({deal,swap,root,state,first,actions,baseline,batches});
        }
    }
    groups.push({phase,seed,fixtures,rows});
}
for(const [p,h]of Object.entries(sourceHashes))assert.equal(sha(p),h);
writeFileSync('gto_constrained_mixture_worlds_20261021.json',JSON.stringify({kind:'constrained-multiaction-mixture-worlds-not-strength',startedUtc,endedUtc:new Date().toISOString(),outerDeadline:new Date(outerDeadline).toISOString(),sourceHashes,actualA9Games:0,controls,groups}),{flag:'wx'});
console.log(JSON.stringify(groups.map(g=>({phase:g.phase,rows:g.rows.length,actions:g.rows.map(r=>r.actions.length)}))));
