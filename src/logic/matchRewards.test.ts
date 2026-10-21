import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { evaluateYHand, evaluateXHand } from './evaluation';
import { gameReducer, INITIAL_GAME_STATE } from './game';
import { createDeck, shuffleDeck } from './deck';
import { beginGameRecording, captureGameRecordMoves, finalizeGameRecord } from './gameRecord';
import { evaluateYHandForAchievement, evaluateXHandForAchievement, getGameRecordAchievementTypes } from '../../server/game-utils.js';
import { scoreMatch, verifyRewardRecord } from '../../server/match-rewards.js';
import { advancedAchievements, awardGuestMatch, getGuestGameAchievements, type MatchRewards } from './matchRewards';

export function playedMatch(starter: 0 | 1 = 0, hidden = false) {
    const initialDeck = shuffleDeck(createDeck());
    const initialDice = [6,5,4,3,2];
    let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: { initialDeck, initialDice, startingPlayer: starter } });
    let recording = beginGameRecording(state, randomUUID(), new Date().toISOString());
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: starter } });
    while (state.phase === 'playing') {
        const p = state.players[state.currentPlayerIndex];
        const cols = [0,1,2,3,4].filter(col => !p.board[2][col]);
        const colIndex = cols[Math.floor(Math.random()*cols.length)];
        state = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: { cardId: p.hand[0].id, colIndex, isHidden: hidden && p.hiddenCardsCount < 3 && p.board.filter(row => row[colIndex]?.isHidden).length < 2 } });
        recording = captureGameRecordMoves(recording, state);
    }
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    const record = finalizeGameRecord(recording,state,{ completedAt: new Date().toISOString(), mode:'bot', viewerPlayerIndex:0,playerNames:['You','AI'] })!;
    return { record, deal: { initialDeck,initialDice }, state };
}

test('reward validation and server scoring agree with complete game reducer plays', () => {
    for (let i=0;i<100;i++) {
        const { record,deal,state }=playedMatch(i%2 as 0 | 1, i%3 === 0);
        assert.deepEqual(scoreMatch(record.moves,record.dice).scores,state.players.map(p=>p.score));
        assert.equal(verifyRewardRecord(record,deal).winner,state.winner);
        assert.deepEqual(getGuestGameAchievements(record).sort(), getGameRecordAchievementTypes(record).sort());
        assert.throws(()=>verifyRewardRecord({...record, scores:[99,98]},deal));
        assert.throws(()=>verifyRewardRecord({...record, dice:[1,1,1,1,1]},deal));
        assert.throws(()=>verifyRewardRecord({...record, moves:record.moves.map((m,j)=>j===0?{...m,drawnCards:[]}:m)},deal));
        assert.throws(()=>verifyRewardRecord({...record, moves: record.moves.map((m,i)=>i===0?{...m,row:2}:m)},deal));
    }
});

test('result shows unlocked and advancing achievements including each streak step', () => {
    const rewards = { before:{gamesPlayed:5,wins:3,currentWinStreak:3},after:{gamesPlayed:6,wins:4,currentWinStreak:4},unlocked:[],achievements:['first_win','win_streak_3'] } as unknown as MatchRewards;
    const rows=advancedAchievements(rewards);
    assert.equal(rows.find(r=>r.type==='win_streak_5')?.progress?.current,4);
    assert.ok(!rows.some(r=>r.type==='win_streak_3'));
    assert.ok(!rows.some(r=>r.type==='first_draw'));
    assert.ok(advancedAchievements({...rewards,unlocked:['first_draw'],achievements:[...rewards.achievements,'first_draw']}).some(r=>r.type==='first_draw'));
    assert.ok(!advancedAchievements({...rewards,after:{gamesPlayed:6,wins:3,currentWinStreak:0}}).some(r=>r.type==='win_streak_5'));
});

test('guest rewards persist once, reset streak on defeat, and award recurring third wins', () => {
    const values = new Map<string,string>();
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
    const {record} = playedMatch();
    const win = {...record,winner:'p1' as const,scores:[20,10] as [number,number]};
    const first=awardGuestMatch(win);
    assert.equal(first.coins.change,50);
    assert.deepEqual(awardGuestMatch(win),first);
    const second=awardGuestMatch({...win,id:randomUUID()});
    assert.equal(second.breakdown.streak,5);
    const third=awardGuestMatch({...win,id:randomUUID()});
    assert.equal(third.breakdown.challenge,25);
    assert.equal(third.after.currentWinStreak,3);
    assert.ok(third.unlocked.includes('win_streak_3'));
    const loss=awardGuestMatch({...win,id:randomUUID(),winner:'p2'});
    assert.equal(loss.after.currentWinStreak,0);
    assert.equal(loss.coins.change,10);
    assert.equal(loss.xp.change,40);
    assert.equal(loss.breakdown.margin,0);
});


test('server comparison matches client for every ordered three-card hand and wheel flush', () => {
    const deck=createDeck();
    for (const a of deck) for (const b of deck) for (const c of deck) {
        if (a.id===b.id || a.id===c.id || b.id===c.id) continue;
        const client=evaluateYHand([a,b,c], 6);
        const server=evaluateYHandForAchievement([a,b,c]);
        assert.equal(server.type,client.type);
        assert.deepEqual(server.kickers,client.kickers);
    }
    const wheel=deck.filter(c=>c.suit==='hearts' && [14,2,3,4,5].includes(c.rank));
    assert.deepEqual(evaluateXHandForAchievement(wheel).kickers, evaluateXHand(wheel).kickers);
});

test('level coins include milestones and every crossed level, once per match', () => {
    const values = new Map<string,string>();
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
    const {record} = playedMatch();
    const loss = {...record,winner:'p2' as const};
    for (const [level,xp,expectedLevel,bonus] of [[1,149,2,100],[4,1199,5,300],[5,1200,5,0],[4,5000,10,1000]]) {
        values.clear();
        values.set('xypoker_guest_progress',JSON.stringify({stats:{gamesPlayed:0,wins:0,currentWinStreak:0},xp,level,rating:1500,achievements:[],receipts:[]}));
        values.set('xypoker_guest_coins','50');
        const receipt=awardGuestMatch(loss);
        assert.equal(receipt.level.new,expectedLevel);
        assert.equal(receipt.breakdown.levelUp,bonus);
        assert.equal(receipt.coins.change,10+bonus);
        assert.equal(receipt.coins.new,60+bonus);
        assert.equal(receipt.xp.change,40);
        assert.deepEqual(awardGuestMatch(loss),receipt);
        assert.equal(values.get('xypoker_guest_coins'),String(60+bonus));
    }
});
