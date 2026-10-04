import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { evaluateXHand } from '../src/logic/evaluation';
import type { Card, Rank, Suit, XHandType } from '../src/logic/types';
const category: XHandType[] = ['HighCard','OnePair','TwoPair','ThreeOfAKind','Straight','Flush','FullHouse','FourOfAKind','StraightFlush','RoyalFlush'];
const sequenceHigh = new Map(Array.from({length:10},(_,i)=> {
    const high=i+5;return [high===5?'2,3,4,5,14':Array.from({length:5},(_,j)=>high-4+j).join(','),high] as const;
}));
function reference(ranks: number[], flush: boolean) {
    const frequencies = Array.from({length:13},(_,i)=>({rank:i+2,count:ranks.filter(r=>r===i+2).length}))
        .filter(x=>x.count).sort((a,b)=>b.count-a.count || b.rank-a.rank);
    const shape=frequencies.map(x=>x.count).join(''), high=sequenceHigh.get(ranks.join(','));
    let type: XHandType, kickers: number[];
    if(flush && high===14){type='RoyalFlush';kickers=[];}
    else if(flush && high){type='StraightFlush';kickers=[high];}
    else if(shape==='41'){type='FourOfAKind';kickers=frequencies.map(x=>x.rank);}
    else if(shape==='32'){type='FullHouse';kickers=frequencies.map(x=>x.rank);}
    else if(flush){type='Flush';kickers=[...ranks].reverse();}
    else if(high){type='Straight';kickers=[high];}
    else {type=shape==='311'?'ThreeOfAKind':shape==='221'?'TwoPair':shape==='2111'?'OnePair':'HighCard';kickers=frequencies.map(x=>x.rank);}
    return {type,kickers,rankValue:category.indexOf(type)+1,score:0};
}
const suits: Suit[]=['hearts','diamonds','clubs','spades'];
let rankProfiles=0,evaluations=0,flushProfiles=0;
const ranks:number[]=[];
function visit(minimum:number){
    if(ranks.length<5){for(let rank=minimum;rank<=14;rank++){if(ranks.filter(r=>r===rank).length>=4)continue;ranks.push(rank);visit(rank);ranks.pop();}return;}
    rankProfiles++;
    const seen=new Map<number,number>();
    const cards: Card[]=ranks.map(rank=>{const count=seen.get(rank)??0;seen.set(rank,count+1);const suit=suits[count];return {rank:rank as Rank,suit,id:`${suit}-${rank}`};});
    // Distinct-rank representatives must include mixed suits for the non-flush branch.
    if(seen.size===5){cards[4]={...cards[4],suit:'diamonds',id:`diamonds-${cards[4].rank}`};}
    const expected=reference(ranks,false);
    for(let rotation=0;rotation<5;rotation++){
        const rotated=cards.slice(rotation).concat(cards.slice(0,rotation));
        assert.deepEqual(evaluateXHand(rotated),expected);evaluations++;
        const relabel=rotated.map(card=>{const suit=suits[(suits.indexOf(card.suit)+1)%4];return {...card,suit,id:`${suit}-${card.rank}`};});
        assert.deepEqual(evaluateXHand(relabel),expected);evaluations++;
    }
    if(seen.size===5){flushProfiles++;const flush=cards.map(card=>({...card,suit:'spades' as const,id:`spades-${card.rank}`}));
        assert.deepEqual(evaluateXHand(flush),reference(ranks,true));evaluations++;}
}
visit(2);
assert.equal(rankProfiles,6175);assert.equal(flushProfiles,1287);
const result={generatedAt:new Date().toISOString(),rankProfiles,flushProfiles,evaluations,
    scope:'Independent rank-multiplicity/straight-table reference for every legal rank multiset; mixed-suit and flush representatives, rotations and suit rotation.',
    limits:['Representative tests do not themselves enumerate every suit assignment or all120 card permutations.','This verifies evaluator tuples, not global equilibrium.']};
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)??'gto_x_kicker_audit.json';
writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(result);
