import { buildAchievementCatalog, type AchievementProgressStats } from './achievements';
import { evaluateYHand, evaluateXHand } from './evaluation';
import type { Card, YHandType, XHandType } from './types';
import type { GameRecordData } from './gameRecord';

export interface RewardChange { old: number; new: number; change: number }
export interface MatchRewards {
    matchId: string;
    mode: 'bot' | 'ranked' | 'private';
    result: 'win' | 'loss' | 'draw';
    rating: RewardChange;
    coins: RewardChange;
    xp: RewardChange;
    level: { old: number; new: number };
    breakdown: { base: number; margin: number; streak: number; challenge: number; levelUp?: number };
    before: AchievementProgressStats;
    after: AchievementProgressStats;
    unlocked: string[];
    achievements: string[];
}

export function advancedAchievements(rewards: MatchRewards) {
    const stored = rewards.achievements.map(achievement_type => ({ achievement_type }));
    const before = buildAchievementCatalog([], rewards.before);
    const seen = new Set<string>();
    return buildAchievementCatalog(stored, rewards.after)
        .filter(row => rewards.unlocked.includes(row.type) || (!row.achievement && row.progress
            && row.progress.current > (before.find(b => b.type === row.type)?.progress?.current ?? 0)))
        .filter(row => {
            if (rewards.unlocked.includes(row.type)) return true;
            const metric = row.progress!.metric;
            if (seen.has(metric)) return false;
            seen.add(metric);
            return true;
        })
        .sort((a, b) => Number(rewards.unlocked.includes(b.type)) - Number(rewards.unlocked.includes(a.type))
            || (b.progress ? b.progress.current / b.progress.target : 1) - (a.progress ? a.progress.current / a.progress.target : 1));
}

const Y_HAND_ACHIEVEMENTS: Record<YHandType,string> = Object.freeze({
    PureStraightFlush: 'y_win_pure_straight_flush',
    ThreeOfAKind: 'y_win_three_of_a_kind',
    StraightFlush: 'y_win_straight_flush',
    PureStraight: 'y_win_pure_straight',
    Flush: 'y_win_flush',
    PureOnePair: 'y_win_pure_one_pair',
    Straight: 'y_win_straight',
    OnePair: 'y_win_one_pair',
    HighCard: 'y_win_high_card',
});

const X_HAND_ACHIEVEMENTS: Record<XHandType,string> = Object.freeze({
    RoyalFlush: 'x_win_royal_flush',
    StraightFlush: 'straight_flush_x',
    FourOfAKind: 'x_win_four_of_a_kind',
    FullHouse: 'x_win_full_house',
    Straight: 'x_win_straight',
    Flush: 'x_win_flush',
    ThreeOfAKind: 'x_win_three_of_a_kind',
    TwoPair: 'x_win_two_pair',
    OnePair: 'x_win_one_pair',
    HighCard: 'x_win_high_card',
});

const compareKickers = (a: number[], b: number[]) => {
    for (let i=0;i<Math.max(a.length,b.length);i++) {
        const delta=(a[i] || 0)-(b[i] || 0);
        if (delta) return Math.sign(delta);
    }
    return 0;
};

function analyzeWonHands(record: GameRecordData) {
    const boards = [0, 1].map(() => Array.from({ length: 3 }, () => Array<Card | null>(5).fill(null)));
    for (const move of record.moves) boards[move.playerIndex][move.row][move.column] = move.card;

    const playerIndex = record.viewerPlayerIndex;
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const achievements = new Set<string>();
    let wonYHands = 0;

    for (let column = 0; column < 5; column += 1) {
        const playerCards = boards[playerIndex].map(row => row[column]);
        const opponentCards = boards[opponentIndex].map(row => row[column]);
        if (playerCards.some(card => !card) || opponentCards.some(card => !card)) continue;
        const playerHand = evaluateYHand(playerCards as Card[], 0);
        const opponentHand = evaluateYHand(opponentCards as Card[], 0);
        const rankDifference = playerHand.rankValue - opponentHand.rankValue;
        const comparison = rankDifference === 0 ? compareKickers(playerHand.kickers, opponentHand.kickers) : Math.sign(rankDifference);
        if (comparison > 0) {
            wonYHands += 1;
            achievements.add(Y_HAND_ACHIEVEMENTS[playerHand.type]);
        }
    }

    const playerX = evaluateXHand(boards[playerIndex][2] as Card[]);
    const opponentX = evaluateXHand(boards[opponentIndex][2] as Card[]);
    const scoreDifference = playerX.rankValue - opponentX.rankValue;
    const xComparison = scoreDifference === 0 && playerX.type === opponentX.type
        ? compareKickers(playerX.kickers, opponentX.kickers)
        : Math.sign(scoreDifference);
    const wonXHand = xComparison > 0;
    if (wonXHand) achievements.add(X_HAND_ACHIEVEMENTS[playerX.type]);

    return { achievements, boards, wonXHand, wonYHands };
}

export function getGuestGameAchievements(record: GameRecordData) {
    const { achievements, boards, wonXHand, wonYHands } = analyzeWonHands(record);
    const playerIndex = record.viewerPlayerIndex;
    const viewerWinner = `p${playerIndex + 1}`;
    const wonGame = record.winner === viewerWinner;
    const viewerScore = record.scores[playerIndex];
    const opponentScore = record.scores[playerIndex === 0 ? 1 : 0];
    const viewerBonuses = record.bonuses[playerIndex];

    if (record.winner === 'draw') achievements.add('first_draw');
    if (viewerScore >= 30) achievements.add('score_30');
    if (viewerBonuses >= 3) achievements.add('bonus_3');
    if (viewerBonuses >= 5) achievements.add('bonus_5');

    if (wonGame) {
        if (Math.abs(viewerScore - opponentScore) === 1) achievements.add('close_win');
        if (viewerBonuses === 0) achievements.add('no_bonus_win');
        if (boards[playerIndex].flat().filter(card => card?.isHidden).length === 3) {
            achievements.add('hidden_three_win');
        }
        if (wonYHands === 5) achievements.add('y_sweep');
        if (wonYHands === 5 && wonXHand) achievements.add('perfect_game');
    }

    return [...achievements];
}

export function awardGuestMatch(record: GameRecordData): MatchRewards {
    const key = 'xypoker_guest_progress';
    let old: { stats: AchievementProgressStats; xp: number; level: number; rating: number; achievements: string[]; receipts: MatchRewards[] };
    try { old = JSON.parse(localStorage.getItem(key) || 'null'); } catch { old = null!; }
    old ||= { stats: { gamesPlayed: 0, wins: 0, currentWinStreak: 0 }, xp: 0, level: 1, rating: 1500, achievements: [], receipts: [] };
    const existing = old.receipts.find(r => r.matchId === record.id);
    if (existing) return existing;
    const result = record.winner === 'draw' ? 'draw' : record.winner === 'p1' ? 'win' : 'loss';
    const won = result === 'win';
    const after = { gamesPlayed: old.stats.gamesPlayed + 1, wins: old.stats.wins + Number(won), currentWinStreak: won ? old.stats.currentWinStreak + 1 : 0 };
    const margin = won ? Math.min(20, Math.max(0, record.scores[0] - record.scores[1])) : 0;
    const streak = won ? Math.min(5, after.currentWinStreak - 1) : 0;
    const challenge = won && after.wins % 3 === 0 ? 1 : 0;
    const breakdown = { base: won ? 30 : result === 'draw' ? 20 : 10, margin: margin * 2, streak: streak * 5, challenge: challenge * 25, levelUp: 0 };
    const xp = (won ? 100 : result === 'draw' ? 60 : 40) + margin * 3 + streak * 10 + challenge * 50;
    let level = old.level;
    while (old.xp + xp >= level * 100 + level * level * 50) level++;
    breakdown.levelUp = (level - old.level) * 100 + (Math.floor(level / 5) - Math.floor(old.level / 5)) * 200;
    const coins = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const ratingDelta = Math.round(32 * ((won ? 1 : result === 'draw' ? 0.5 : 0) - 1 / (1 + 10 ** ((1500 - old.rating) / 400))));
    const newRating = Math.max(0, old.rating + ratingDelta);
    const earned = buildAchievementCatalog([], after).filter(row => row.progress && row.progress.current === row.progress.target).map(row => row.type);
    if (won) earned.push('first_win');
    earned.push(...getGuestGameAchievements(record));
    const achievements = [...new Set([...old.achievements, ...earned])];
    const balance = Number(localStorage.getItem('xypoker_guest_coins')) || 0;
    const rewards: MatchRewards = {
        matchId: record.id, mode: 'bot', result, rating: { old: old.rating, new: newRating, change: newRating - old.rating },
        coins: { old: balance, new: balance + coins, change: coins }, xp: { old: old.xp, new: old.xp + xp, change: xp },
        level: { old: old.level, new: level }, breakdown, before: old.stats, after,
        unlocked: achievements.filter(type => !old.achievements.includes(type)), achievements,
    };
    localStorage.setItem('xypoker_guest_coins', String(balance + coins));
    localStorage.setItem(key, JSON.stringify({ stats: after, xp: rewards.xp.new, level, rating: newRating, achievements, receipts: [...old.receipts.slice(-49), rewards] }));
    return rewards;
}
