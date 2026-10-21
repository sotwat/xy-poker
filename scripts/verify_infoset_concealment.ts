import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { createDeck } from '../src/logic/deck';
import type { Card, GameState } from '../src/logic/types';

type Move = {cardId:string;colIndex:number;isHidden:boolean};
type Arm = {moves:Move[];winner:GameState['winner'];scores:number[];win:number;margin:number};
type World = {worldSeed:number;state:GameState;arms:Arm[][]};
type Row = {deal:number;swap:number;root:number;state:GameState;first:Move;batches:{split:string;worlds:World[];matrix:number[][]}[]};
const data: {startedUtc:string;endedUtc:string;outerDeadline:string;sourceHashes:Record<string,string>;controls:number;actualA9Games:number;groups:{phase:string;seed:number;fixtures:{deal:number;dealSeed:number;deck:Card[];dice:number[];moves:Move[]}[];excluded:{deal:number;swap:number}[];rows:Row[]}[]} = JSON.parse(readFileSync('gto_infoset_concealment_20261021.json','utf8'));
for(const [p,h]of Object.entries(data.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'),h);
assert.ok(Date.parse(data.endedUtc)<Date.parse(data.outerDeadline));
assert.ok(Date.parse(data.endedUtc)-Date.parse(data.startedUtc)<120000);
assert.equal(data.actualA9Games,0);
const deckIds=createDeck().map(c=>c.id).sort();
function conserve(s:GameState){
    const cards=[...s.deck,...s.players.flatMap(p=>[...p.hand,...p.board.flat().filter((c):c is Card=>c!==null)])];
    assert.deepEqual(cards.map(c=>c.id).sort(),deckIds);
    for(const p of s.players){
        assert.equal(p.hiddenCardsCount,p.board.flat().filter(c=>c?.isHidden).length);
        assert.ok(p.hiddenCardsCount<=3);
        for(let col=0;col<5;col++)assert.ok(p.board.filter(r=>r[col]?.isHidden).length<=2);
    }
}
function step(s:GameState,m:Move){const next=gameReducer(s,{type:'PLACE_AND_DRAW',payload:m});assert.notEqual(next,s);conserve(next);return next;}
function visible(s:GameState,root:number){
    return {...s,deck:s.deck.length,players:s.players.map((p,i)=>i===root?p:{...p,hand:p.hand.length,board:p.board.map(r=>r.map(c=>c?.isHidden?{isHidden:true}:c))})};
}
let replays=0,placements=0,worlds=0,fixtures=0;
const usedSeeds=new Set<number>();
assert.deepEqual(data.groups.map(g=>[g.phase,g.seed]),[['selection',100521101],['confirmation',100521102]]);
for(const g of data.groups){
    assert.equal(g.fixtures.length,4);
    const expectedKeys=[];
    for(const [di,f]of g.fixtures.entries()){
        assert.equal(f.deal,di);assert.equal(f.dealSeed,(g.seed+Math.imul(di,2654435761))>>>0);
        assert.deepEqual(f.deck.map(c=>c.id).sort(),deckIds);assert.equal(f.moves.length,6);
        let base=gameReducer(INITIAL_GAME_STATE,{type:'START_GAME',payload:{initialDeck:f.deck,initialDice:f.dice,startingPlayer:0}});
        base=gameReducer(base,{type:'CHOOSE_TURN_ORDER',payload:{startingPlayer:0}});
        for(const m of f.moves)base=step(base,m);fixtures++;
        for(const swap of [0,1]){
            const s=structuredClone(base);
            if(swap){s.players=[{...s.players[1],id:'p1'},{...s.players[0],id:'p2'}];s.currentPlayerIndex=1;}
            const row=g.rows.find(r=>r.deal===di&&r.swap===swap);
            // All preregistered fixtures were eligible; a later dataset must explicitly verify exclusions.
            assert.ok(row);expectedKeys.push(`${di}/${swap}`);
            assert.deepEqual(row.state,JSON.parse(JSON.stringify(s)));assert.equal(row.root,s.currentPlayerIndex);
            assert.deepEqual(row.batches.map(b=>b.split),['fit','heldout']);
            for(const [bi,b]of row.batches.entries()){
                assert.equal(b.worlds.length,16);
                const sums=Array.from({length:2},()=>[0,0,0,0]);
                for(const [wi,w]of b.worlds.entries()){
                    const seed=(f.dealSeed^(bi?0x54455354:0x46495431)^Math.imul(wi+1,2246822519))>>>0;
                    assert.equal(w.worldSeed,seed);
                    if(!swap){assert.ok(!usedSeeds.has(seed));usedSeeds.add(seed);}
                    assert.deepEqual(visible(w.state,row.root),JSON.parse(JSON.stringify(visible(s,row.root))));conserve(w.state);worlds++;
                    assert.equal(w.arms.length,4);
                    for(const [pi,arms]of w.arms.entries()){
                        assert.equal(arms.length,2);const firstStates=[];
                        for(const [ai,a]of arms.entries()){
                            assert.equal(a.moves.length,24);assert.deepEqual(a.moves[0],{...row.first,isHidden:Boolean(ai)});
                            let st=structuredClone(w.state);
                            for(const [mi,m]of a.moves.entries()){assert.equal(st.phase,'playing');st=step(st,m);placements++;if(!mi)firstStates.push(st);}
                            assert.equal(st.phase,'scoring');st=gameReducer(st,{type:'CALCULATE_SCORE'});
                            assert.equal(st.phase,'ended');assert.equal(a.winner,st.winner);assert.deepEqual(a.scores,st.players.map(p=>p.score));
                            const win:number=st.winner==='draw'?0:st.winner===`p${row.root+1}`?1:-1;
                            assert.equal(a.win,win);assert.equal(a.margin,st.players[row.root].score-st.players[1-row.root].score);
                            sums[ai][pi]+=win;replays++;
                        }
                        const physical=(st:GameState)=>JSON.stringify(st,(key,value)=>['isHidden','hiddenCardsCount'].includes(key)?undefined:value);
                        assert.equal(physical(firstStates[0]),physical(firstStates[1]));
                    }
                }
                assert.deepEqual(b.matrix,sums.map(r=>r.map(v=>v/16)));
            }
        }
    }
    assert.deepEqual(g.excluded,[]);assert.deepEqual(g.rows.map(r=>`${r.deal}/${r.swap}`),expectedKeys);
}
assert.equal(data.controls,worlds);
console.log(JSON.stringify({verified:true,fixtures,worlds,replays,placements,controls:data.controls,uniqueWorldSeeds:usedSeeds.size,elapsedMs:Date.parse(data.endedUtc)-Date.parse(data.startedUtc)}));
