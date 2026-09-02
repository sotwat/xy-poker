import { writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { solveSymmetricZeroSum } from '../src/logic/gto';
import {
    firstEmptyRow,
    getGtoHideProbability,
    getGtoTurnOrderScore,
    scoreGtoMove,
    XY_GTO_A1,
    XY_GTO_A2,
    XY_GTO_A3,
    XY_GTO_A4,
    XY_GTO_A4_SOLVER_BASE,
    type GtoPolicyWeights,
} from '../src/logic/gtoPolicy';
import type { Card, GameState } from '../src/logic/types';

interface StrategyProfile extends GtoPolicyWeights {
    id: string;
    name: string;
    description: string;
    temperature: number;
}

interface MatchResult {
    utility: -1 | 0 | 1;
    scoreFor: number;
    scoreAgainst: number;
    firstPlayer: 0 | 1;
    hiddenFor: number;
    hiddenAgainst: number;
    bonusesFor: number;
    bonusesAgainst: number;
}

interface CellStats {
    mean: number;
    standardError: number;
    pairedDeals: number;
}

const DEFAULT_PAIRED_DEALS = 600;
const DEFAULT_PROBE_DEALS = 1_500;
const DEFAULT_SEARCH_DEALS = 220;
const DEFAULT_CANDIDATE_DEALS = 180;
const DEFAULT_SEARCH_ROUNDS = 4;
const DEFAULT_RESPONSE_CANDIDATES = 40;
const DEFAULT_SEED = 0x5859504f;
const OUTPUT_PATH = 'gto_solution.json';

const STRATEGIES: StrategyProfile[] = [
    {
        id: 'balanced',
        name: '均衡型',
        description: 'Y役、X役、列完成ボーナス、選択肢維持を同程度に評価する。',
        yWeight: 1.0,
        xWeight: 1.0,
        tempoWeight: 1.0,
        diceWeight: 1.0,
        flexibilityWeight: 1.0,
        row3Delay: 1.0,
        concealment: 0.15,
        firstBias: 0,
        temperature: 0.025,
    },
    {
        id: 'y_pressure',
        name: 'Y役圧力型',
        description: '縦3枚役の完成度を最優先し、高い出目の列を強く争う。',
        yWeight: 1.55,
        xWeight: 0.55,
        tempoWeight: 0.75,
        diceWeight: 1.35,
        flexibilityWeight: 0.65,
        row3Delay: 0.55,
        concealment: -0.2,
        firstBias: 0.2,
        temperature: 0.02,
    },
    {
        id: 'x_architect',
        name: 'X役構築型',
        description: '3段目の5枚役のペア、同スート、ストレート受けを優先する。',
        yWeight: 0.65,
        xWeight: 1.8,
        tempoWeight: 0.7,
        diceWeight: 0.7,
        flexibilityWeight: 1.15,
        row3Delay: 1.25,
        concealment: 0,
        firstBias: -0.15,
        temperature: 0.02,
    },
    {
        id: 'tempo_draw',
        name: 'テンポ・ドロー型',
        description: '相手より先に列を埋め、追加ドローと手札選択肢を獲得する。',
        yWeight: 0.75,
        xWeight: 0.75,
        tempoWeight: 1.9,
        diceWeight: 0.75,
        flexibilityWeight: 0.8,
        row3Delay: 0.2,
        concealment: -0.25,
        firstBias: 0.75,
        temperature: 0.03,
    },
    {
        id: 'high_dice_control',
        name: '高出目支配型',
        description: 'カード資源を高い出目の列へ集中し、低い列を捨て列として扱う。',
        yWeight: 1.25,
        xWeight: 0.7,
        tempoWeight: 0.65,
        diceWeight: 1.9,
        flexibilityWeight: 0.7,
        row3Delay: 0.85,
        concealment: 0.1,
        firstBias: 0.1,
        temperature: 0.02,
    },
    {
        id: 'concealment',
        name: '情報隠蔽型',
        description: '伏せ札を積極的に使い、強弱と消費カードの情報を隠す。',
        yWeight: 0.95,
        xWeight: 0.95,
        tempoWeight: 0.85,
        diceWeight: 1.05,
        flexibilityWeight: 1.0,
        row3Delay: 1.05,
        concealment: 1.45,
        firstBias: -0.1,
        temperature: 0.04,
    },
    {
        id: 'option_value',
        name: '選択肢温存型',
        description: '3段目の確定を遅らせ、複数の役への受けと高札を長く保持する。',
        ...XY_GTO_A1,
        temperature: 0.025,
    },
    {
        id: 'regime_adaptive',
        name: '盤面レジーム適応型',
        description: '出目全体の平均・分散・レンジから、低出目列のボーナス競争、Y/X配分、先後を動的に変える。',
        ...XY_GTO_A2,
        temperature: 0.025,
    },
    {
        id: 'hand_efficiency',
        name: '役効率適応型',
        description: '純正ストレートの順序、完成札、完成アウツ、出目利得を統合する。',
        ...XY_GTO_A3,
        temperature: 0.042839,
    },
    {
        id: 'psro_rebalanced',
        name: 'PSRO再均衡型',
        description: '独立5,000組の確認を通過した、Y/X・テンポ・純正ストレート配分の再均衡基礎方策。',
        ...XY_GTO_A4_SOLVER_BASE,
        temperature: 0.024119,
    },
    {
        id: 'opening_efficiency',
        name: '初手効率適応型',
        description: '1行目の純正ストレート経路数とキッカー上限を評価し、Qを別列の初手資源として温存する。',
        ...XY_GTO_A4,
        temperature: 0.024119,
    },
    {
        id: 'reactive',
        name: '後攻対応型',
        description: '後攻を選びやすくし、相手の公開済み列に応じて資源配分を変える。',
        yWeight: 1.05,
        xWeight: 0.9,
        tempoWeight: 0.55,
        diceWeight: 1.15,
        flexibilityWeight: 1.35,
        row3Delay: 1.35,
        concealment: -0.05,
        firstBias: -1.1,
        temperature: 0.02,
    },
];

const PROBE_STRATEGIES: StrategyProfile[] = [
    {
        ...STRATEGIES[1],
        id: 'probe_y_extreme',
        name: '検証用・極端Y型',
        description: '母集団外の極端なY役偏重方策。',
        yWeight: 2.5,
        xWeight: 0.15,
        diceWeight: 2.2,
        row3Delay: 0,
    },
    {
        ...STRATEGIES[2],
        id: 'probe_x_extreme',
        name: '検証用・極端X型',
        description: '母集団外の極端なX役偏重方策。',
        yWeight: 0.2,
        xWeight: 2.8,
        tempoWeight: 0.15,
    },
    {
        ...STRATEGIES[3],
        id: 'probe_all_hidden',
        name: '検証用・最大隠蔽型',
        description: '伏せ札3枚を可能な限り早く使う母集団外方策。',
        concealment: 4,
        firstBias: 1.2,
    },
    {
        ...STRATEGIES.find(strategy => strategy.id === 'regime_adaptive')!,
        id: 'probe_polarized_rush',
        name: '検証用・極端レジーム適応型',
        description: '高分散盤面の安い列完成と先攻価値を強くする母集団外方策。',
        boardAdaptation: 1.5,
        tempoWeight: 0.8,
        row3Delay: 1.45,
    },
    {
        ...STRATEGIES.find(strategy => strategy.id === 'hand_efficiency')!,
        id: 'probe_pure_extreme',
        name: '検証用・純正ストレート過剰型',
        description: '他の役やX役を犠牲にしてでも純正ストレートを追う母集団外方策。',
        pureStraightEfficiency: 20,
    },
    {
        ...STRATEGIES.find(strategy => strategy.id === 'opening_efficiency')!,
        id: 'probe_q_anchor_extreme',
        name: '検証用・Q初手過剰型',
        description: 'Q初手とQ温存を母集団外の極端な強さで評価する方策。',
        openingAnchorEfficiency: 5,
        queenConservation: 4,
    },
    {
        ...STRATEGIES.find(strategy => strategy.id === 'opening_efficiency')!,
        id: 'probe_q_expendable',
        name: '検証用・Q消費型',
        description: '初手ランクの経路価値を使わず、Qの横断的な機会費用も無視する方策。',
        openingAnchorEfficiency: 0,
        queenConservation: 0,
    },
];

function parsePositiveInteger(flag: string, fallback: number): number {
    const argument = process.argv.find(value => value.startsWith(`${flag}=`));
    if (!argument) return fallback;
    const value = Number.parseInt(argument.slice(flag.length + 1), 10);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} must be a positive integer.`);
    return value;
}

function mulberry32(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value = (value + 0x6d2b79f5) >>> 0;
        let result = value;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
    };
}

function mixSeed(...values: number[]): number {
    let hash = 0x811c9dc5;
    for (const value of values) {
        hash ^= value >>> 0;
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function shuffledDeck(rng: () => number): Card[] {
    const deck = createDeck();
    for (let index = deck.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(rng() * (index + 1));
        [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
    }
    return deck;
}

function swapInitialHands(deck: Card[]): Card[] {
    return [...deck.slice(4, 8), ...deck.slice(0, 4), ...deck.slice(8)];
}

function moveScore(
    state: GameState,
    playerIndex: 0 | 1,
    card: Card,
    column: number,
    profile: StrategyProfile,
    rng: () => number,
): number {
    return scoreGtoMove(state, playerIndex, card, column, profile)
        + (rng() - 0.5) * profile.temperature;
}

function shouldHide(
    state: GameState,
    playerIndex: 0 | 1,
    card: Card,
    column: number,
    profile: StrategyProfile,
    rng: () => number,
): boolean {
    return rng() < getGtoHideProbability(state, playerIndex, card, column, profile);
}

function chooseMove(
    state: GameState,
    playerIndex: 0 | 1,
    profile: StrategyProfile,
    rng: () => number,
): { cardId: string; colIndex: number; isHidden: boolean } {
    const player = state.players[playerIndex];
    let bestCard = player.hand[0];
    let bestColumn = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const card of player.hand) {
        for (let column = 0; column < 5; column++) {
            if (firstEmptyRow(player, column) === -1) continue;
            const score = moveScore(state, playerIndex, card, column, profile, rng);
            if (score > bestScore) {
                bestScore = score;
                bestCard = card;
                bestColumn = column;
            }
        }
    }

    return {
        cardId: bestCard.id,
        colIndex: bestColumn,
        isHidden: shouldHide(state, playerIndex, bestCard, bestColumn, profile, rng),
    };
}

function chooseFirstPlayer(
    state: GameState,
    chooser: 0 | 1,
    profile: StrategyProfile,
): 0 | 1 {
    return getGtoTurnOrderScore(state.players[chooser], profile) > 0
        ? chooser
        : (1 - chooser) as 0 | 1;
}

function playMatch(
    profileP1: StrategyProfile,
    profileP2: StrategyProfile,
    deck: Card[],
    dice: number[],
    selector: 0 | 1,
    seed: number,
): MatchResult {
    const rng = mulberry32(seed);
    let state = gameReducer(INITIAL_GAME_STATE, {
        type: 'START_GAME',
        payload: { initialDeck: deck, initialDice: dice, startingPlayer: selector },
    });
    const selectorProfile = selector === 0 ? profileP1 : profileP2;
    const firstPlayer = chooseFirstPlayer(state, selector, selectorProfile);
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: firstPlayer } });

    while (state.phase === 'playing') {
        const playerIndex = state.currentPlayerIndex as 0 | 1;
        const profile = playerIndex === 0 ? profileP1 : profileP2;
        const move = chooseMove(state, playerIndex, profile, rng);
        const nextState = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        if (nextState === state) {
            throw new Error(`Illegal move generated by ${profile.id}: ${JSON.stringify({
                playerIndex,
                move,
                hand: state.players[playerIndex].hand.map(card => card.id),
                hiddenCardsCount: state.players[playerIndex].hiddenCardsCount,
                column: state.players[playerIndex].board.map(row => row[move.colIndex]?.id ?? null),
            })}`);
        }
        state = nextState;
    }

    if (state.phase !== 'scoring') throw new Error(`Unexpected terminal phase: ${state.phase}`);
    state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    const utility = state.winner === 'p1' ? 1 : state.winner === 'p2' ? -1 : 0;
    return {
        utility,
        scoreFor: state.players[0].score,
        scoreAgainst: state.players[1].score,
        firstPlayer,
        hiddenFor: state.players[0].hiddenCardsCount,
        hiddenAgainst: state.players[1].hiddenCardsCount,
        bonusesFor: state.players[0].bonusesClaimed,
        bonusesAgainst: state.players[1].bonusesClaimed,
    };
}

function pairedUtility(
    row: StrategyProfile,
    column: StrategyProfile,
    baseSeed: number,
): { utility: number; rowStats: MatchResult[] } {
    const chanceRng = mulberry32(baseSeed);
    const deck = shuffledDeck(chanceRng);
    const dice = Array.from({ length: 5 }, () => Math.floor(chanceRng() * 6) + 1).sort((a, b) => b - a);
    const selector = (chanceRng() < 0.5 ? 0 : 1) as 0 | 1;

    const first = playMatch(row, column, deck, dice, selector, mixSeed(baseSeed, 1));
    const second = playMatch(
        column,
        row,
        swapInitialHands(deck),
        dice,
        (1 - selector) as 0 | 1,
        mixSeed(baseSeed, 2),
    );
    return { utility: (first.utility - second.utility) / 2, rowStats: [first, second] };
}

function summarize(values: number[]): CellStats {
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    const variance = values.length > 1
        ? values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1)
        : 0;
    return { mean, standardError: Math.sqrt(variance / values.length), pairedDeals: values.length };
}

function solvePayoffMatrix(pairedDeals: number, seed: number): { matrix: number[][]; cells: CellStats[][] } {
    const size = STRATEGIES.length;
    const matrix = Array.from({ length: size }, () => Array<number>(size).fill(0));
    const cells = Array.from({ length: size }, () => Array<CellStats>(size));

    for (let row = 0; row < size; row++) {
        cells[row][row] = { mean: 0, standardError: 0, pairedDeals };
        for (let column = row + 1; column < size; column++) {
            const values: number[] = [];
            for (let deal = 0; deal < pairedDeals; deal++) {
                values.push(pairedUtility(
                    STRATEGIES[row],
                    STRATEGIES[column],
                    mixSeed(seed, row, column, deal),
                ).utility);
            }
            const stats = summarize(values);
            matrix[row][column] = stats.mean;
            matrix[column][row] = -stats.mean;
            cells[row][column] = stats;
            cells[column][row] = { ...stats, mean: -stats.mean };
        }
    }
    return { matrix, cells };
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function mutateProfile(anchor: StrategyProfile, round: number, candidate: number, seed: number): StrategyProfile {
    const rng = mulberry32(mixSeed(seed, 0x4d555441, round, candidate));
    const scale = (value: number, minimum: number, maximum: number): number => (
        clamp(value * Math.exp((rng() - 0.5) * 1.5), minimum, maximum)
    );
    const randomRestart = candidate % 5 === 4;

    return {
        id: `response_r${round}_${candidate}`,
        name: `探索応答 R${round}-${candidate}`,
        description: `第${round}回の母集団外最適応答探索で生成したパラメータ方策。`,
        yWeight: randomRestart ? 0.2 + rng() * 2.3 : scale(anchor.yWeight, 0.2, 2.5),
        xWeight: randomRestart ? 0.1 + rng() * 2.7 : scale(anchor.xWeight, 0.1, 2.8),
        tempoWeight: randomRestart ? 0.1 + rng() * 2.3 : scale(anchor.tempoWeight, 0.1, 2.4),
        diceWeight: randomRestart ? 0.3 + rng() * 2.1 : scale(anchor.diceWeight, 0.3, 2.4),
        flexibilityWeight: randomRestart ? 0.3 + rng() * 2.2 : scale(anchor.flexibilityWeight, 0.3, 2.5),
        row3Delay: randomRestart ? rng() * 3 : scale(Math.max(anchor.row3Delay, 0.05), 0, 3),
        concealment: randomRestart
            ? -1 + rng() * 4
            : clamp(anchor.concealment + (rng() - 0.5) * 1.8, -1, 3),
        firstBias: randomRestart ? -1.5 + rng() * 3 : clamp(anchor.firstBias + (rng() - 0.5), -1.5, 1.5),
        boardAdaptation: randomRestart
            ? rng() * 1.5
            : clamp((anchor.boardAdaptation ?? 0) + (rng() - 0.5) * 0.8, 0, 1.5),
        pureStraightEfficiency: randomRestart
            ? rng() * 20
            : clamp((anchor.pureStraightEfficiency ?? 0) * Math.exp((rng() - 0.5) * 1.5), 0, 20),
        openingAnchorEfficiency: randomRestart
            ? rng() * 6
            : clamp((anchor.openingAnchorEfficiency ?? 0) * Math.exp((rng() - 0.5) * 1.5)
                + (rng() - 0.5) * 0.25, 0, 6),
        pureStraightKickerEfficiency: randomRestart
            ? rng() * 2
            : clamp((anchor.pureStraightKickerEfficiency ?? 0) * Math.exp((rng() - 0.5) * 1.2)
                + (rng() - 0.5) * 0.15, 0, 2),
        queenConservation: randomRestart
            ? rng() * 5
            : clamp((anchor.queenConservation ?? 0) * Math.exp((rng() - 0.5) * 1.5)
                + (rng() - 0.5) * 0.2, 0, 5),
        temperature: 0.01 + rng() * 0.04,
    };
}

function evaluateAgainstMixture(
    candidate: StrategyProfile,
    mixture: number[],
    pairedDeals: number,
    seed: number,
): CellStats {
    const values: number[] = [];
    for (let deal = 0; deal < pairedDeals; deal++) {
        const dealSeed = mixSeed(seed, deal);
        const opponentIndex = sampleIndex(mixture, mulberry32(mixSeed(dealSeed, 0x4f5050)));
        values.push(pairedUtility(candidate, STRATEGIES[opponentIndex], dealSeed).utility);
    }
    return summarize(values);
}

function discoverBestResponses(
    rounds: number,
    searchDeals: number,
    candidateDeals: number,
    confirmationDeals: number,
    candidatesPerRound: number,
    seed: number,
): Array<{
    round: number;
    testedCandidates: number;
    candidateId: string;
    exploration: CellStats;
    confirmation: CellStats;
    lower95: number;
    accepted: boolean;
}> {
    const searchLog = [];

    for (let round = 1; round <= rounds; round++) {
        const searchGame = solvePayoffMatrix(searchDeals, mixSeed(seed, 0x53454152, round));
        const equilibrium = solveSymmetricZeroSum(searchGame.matrix, 120_000);
        let bestCandidate: StrategyProfile | null = null;
        let bestExploration: CellStats | null = null;

        for (let candidateIndex = 0; candidateIndex < candidatesPerRound; candidateIndex++) {
            const anchorIndex = sampleIndex(
                equilibrium.averageStrategy,
                mulberry32(mixSeed(seed, round, candidateIndex, 0x414e43)),
            );
            const candidate = mutateProfile(STRATEGIES[anchorIndex], round, candidateIndex, seed);
            const exploration = evaluateAgainstMixture(
                candidate,
                equilibrium.averageStrategy,
                candidateDeals,
                mixSeed(seed, 0x4558504c, round, candidateIndex),
            );
            if (!bestExploration || exploration.mean > bestExploration.mean) {
                bestCandidate = candidate;
                bestExploration = exploration;
            }
        }

        if (!bestCandidate || !bestExploration) throw new Error('Response search produced no candidates.');
        const confirmation = evaluateAgainstMixture(
            bestCandidate,
            equilibrium.averageStrategy,
            confirmationDeals,
            mixSeed(seed, 0x434f4e46, round),
        );
        const lower95 = confirmation.mean - 1.96 * confirmation.standardError;
        const accepted = lower95 > 0.01;
        searchLog.push({
            round,
            testedCandidates: candidatesPerRound,
            candidateId: bestCandidate.id,
            exploration: bestExploration,
            confirmation,
            lower95,
            accepted,
        });
        if (!accepted) break;
        STRATEGIES.push(bestCandidate);
    }
    return searchLog;
}

function equilibriumConfidenceBound(
    cells: CellStats[][],
    mixture: number[],
    bestResponseValues: number[],
): { upper95: number; responseStandardErrors: number[] } {
    const responseStandardErrors = cells.map(row => Math.sqrt(row.reduce(
        (variance, cell, index) => variance + mixture[index] ** 2 * cell.standardError ** 2,
        0,
    )));
    const upper95 = Math.max(...bestResponseValues.map(
        (value, index) => value + 1.96 * responseStandardErrors[index],
    ));
    return { upper95, responseStandardErrors };
}

function sampleIndex(probabilities: number[], rng: () => number): number {
    const target = rng();
    let cumulative = 0;
    for (let index = 0; index < probabilities.length; index++) {
        cumulative += probabilities[index];
        if (target <= cumulative) return index;
    }
    return probabilities.length - 1;
}

function validateProbes(
    mixture: number[],
    pairedDeals: number,
    seed: number,
): Array<CellStats & { id: string; name: string }> {
    return PROBE_STRATEGIES.map((probe, probeIndex) => {
        const values: number[] = [];
        for (let deal = 0; deal < pairedDeals; deal++) {
            const dealSeed = mixSeed(seed, 0x50524f42, probeIndex, deal);
            const opponentIndex = sampleIndex(mixture, mulberry32(dealSeed));
            values.push(pairedUtility(probe, STRATEGIES[opponentIndex], dealSeed).utility);
        }
        return { id: probe.id, name: probe.name, ...summarize(values) };
    });
}

function estimateEquilibriumPlay(
    mixture: number[],
    games: number,
    seed: number,
): {
    games: number;
    firstPlayerUtility: number;
    firstPlayerUtilityStandardError: number;
    firstWinRate: number;
    secondWinRate: number;
    drawRate: number;
    chooserChoseFirstRate: number;
    averageScore: number;
    averageHiddenCards: number;
    averageBonusDraws: number;
} {
    const values: number[] = [];
    let firstWins = 0;
    let secondWins = 0;
    let draws = 0;
    let choseFirst = 0;
    let totalScore = 0;
    let totalHidden = 0;
    let totalBonuses = 0;
    for (let deal = 0; deal < games; deal++) {
        const rng = mulberry32(mixSeed(seed, 0x53454154, deal));
        const deck = shuffledDeck(rng);
        const dice = Array.from({ length: 5 }, () => Math.floor(rng() * 6) + 1).sort((a, b) => b - a);
        const selector = (rng() < 0.5 ? 0 : 1) as 0 | 1;
        const profileP1 = STRATEGIES[sampleIndex(mixture, rng)];
        const profileP2 = STRATEGIES[sampleIndex(mixture, rng)];
        const result = playMatch(profileP1, profileP2, deck, dice, selector, mixSeed(seed, deal));
        const firstUtility = result.firstPlayer === 0 ? result.utility : -result.utility;
        values.push(firstUtility);
        if (firstUtility > 0) firstWins++;
        else if (firstUtility < 0) secondWins++;
        else draws++;
        if (result.firstPlayer === selector) choseFirst++;
        totalScore += result.scoreFor + result.scoreAgainst;
        totalHidden += result.hiddenFor + result.hiddenAgainst;
        totalBonuses += result.bonusesFor + result.bonusesAgainst;
    }
    const utility = summarize(values);
    return {
        games,
        firstPlayerUtility: utility.mean,
        firstPlayerUtilityStandardError: utility.standardError,
        firstWinRate: firstWins / games,
        secondWinRate: secondWins / games,
        drawRate: draws / games,
        chooserChoseFirstRate: choseFirst / games,
        averageScore: totalScore / (games * 2),
        averageHiddenCards: totalHidden / (games * 2),
        averageBonusDraws: totalBonuses / (games * 2),
    };
}

function round(value: number, digits = 6): number {
    return Number(value.toFixed(digits));
}

function main(): void {
    const pairedDeals = parsePositiveInteger('--deals', DEFAULT_PAIRED_DEALS);
    const probeDeals = parsePositiveInteger('--probe-deals', DEFAULT_PROBE_DEALS);
    const searchDeals = parsePositiveInteger('--search-deals', DEFAULT_SEARCH_DEALS);
    const candidateDeals = parsePositiveInteger('--candidate-deals', DEFAULT_CANDIDATE_DEALS);
    const searchRounds = parsePositiveInteger('--search-rounds', DEFAULT_SEARCH_ROUNDS);
    const responseCandidates = parsePositiveInteger('--response-candidates', DEFAULT_RESPONSE_CANDIDATES);
    const seed = parsePositiveInteger('--seed', DEFAULT_SEED);
    const startedAt = Date.now();
    console.log(`Searching for best responses (${searchRounds} rounds, ${STRATEGIES.length} base strategies)...`);
    const responseSearch = discoverBestResponses(
        searchRounds,
        searchDeals,
        candidateDeals,
        probeDeals,
        responseCandidates,
        seed,
    );
    responseSearch.forEach(entry => {
        console.log(`  round ${entry.round}: ${entry.candidateId} confirmation=${entry.confirmation.mean.toFixed(4)}, lower95=${entry.lower95.toFixed(4)}, accepted=${entry.accepted}`);
    });

    console.log(`Building final ${STRATEGIES.length}x${STRATEGIES.length} payoff matrix (${pairedDeals} paired deals/cell)...`);

    const { matrix, cells } = solvePayoffMatrix(pairedDeals, seed);
    const equilibrium = solveSymmetricZeroSum(matrix, 300_000);
    const confidence = equilibriumConfidenceBound(cells, equilibrium.averageStrategy, equilibrium.bestResponseValues);
    const probes = validateProbes(equilibrium.averageStrategy, probeDeals, seed);
    const equilibriumPlay = estimateEquilibriumPlay(equilibrium.averageStrategy, probeDeals, seed);

    const result = {
        schemaVersion: 4,
        generatedAt: new Date().toISOString(),
        solver: {
            method: 'PSRO-style response expansion + paired self-play payoff matrix + regret-matching+',
            utility: '+1 win, 0 draw, -1 loss',
            seed,
            pairedDealsPerCell: pairedDeals,
            probePairedDeals: probeDeals,
            searchDealsPerCell: searchDeals,
            candidateDeals,
            searchRoundsRequested: searchRounds,
            responseCandidatesPerRound: responseCandidates,
            regretIterations: equilibrium.iterations,
            runtimeSeconds: round((Date.now() - startedAt) / 1000, 3),
        },
        strategies: STRATEGIES.map((profile, index) => ({
            id: profile.id,
            name: profile.name,
            description: profile.description,
            parameters: {
                yWeight: round(profile.yWeight),
                xWeight: round(profile.xWeight),
                tempoWeight: round(profile.tempoWeight),
                diceWeight: round(profile.diceWeight),
                flexibilityWeight: round(profile.flexibilityWeight),
                row3Delay: round(profile.row3Delay),
                concealment: round(profile.concealment),
                firstBias: round(profile.firstBias),
                boardAdaptation: round(profile.boardAdaptation ?? 0),
                pureStraightEfficiency: round(profile.pureStraightEfficiency ?? 0),
                openingAnchorEfficiency: round(profile.openingAnchorEfficiency ?? 0),
                pureStraightKickerEfficiency: round(profile.pureStraightKickerEfficiency ?? 0),
                queenConservation: round(profile.queenConservation ?? 0),
                temperature: round(profile.temperature),
            },
            equilibriumProbability: round(equilibrium.averageStrategy[index]),
            bestResponseValueAgainstMixture: round(equilibrium.bestResponseValues[index]),
            responseStandardError: round(confidence.responseStandardErrors[index]),
        })),
        payoffMatrix: matrix.map(row => row.map(value => round(value))),
        payoffStandardErrors: cells.map(row => row.map(cell => round(cell.standardError))),
        populationExploitability: round(equilibrium.exploitability),
        populationExploitabilityUpper95: round(confidence.upper95),
        bestResponse: STRATEGIES[equilibrium.bestResponseIndex].id,
        responseSearch: responseSearch.map(entry => ({
            ...entry,
            exploration: {
                ...entry.exploration,
                mean: round(entry.exploration.mean),
                standardError: round(entry.exploration.standardError),
            },
            confirmation: {
                ...entry.confirmation,
                mean: round(entry.confirmation.mean),
                standardError: round(entry.confirmation.standardError),
            },
            lower95: round(entry.lower95),
        })),
        outOfPopulationProbes: probes.map(probe => ({
            ...probe,
            mean: round(probe.mean),
            standardError: round(probe.standardError),
            upper95: round(probe.mean + 1.96 * probe.standardError),
        })),
        equilibriumPlayStudy: {
            ...equilibriumPlay,
            firstPlayerUtility: round(equilibriumPlay.firstPlayerUtility),
            firstPlayerUtilityStandardError: round(equilibriumPlay.firstPlayerUtilityStandardError),
            firstWinRate: round(equilibriumPlay.firstWinRate),
            secondWinRate: round(equilibriumPlay.secondWinRate),
            drawRate: round(equilibriumPlay.drawRate),
            chooserChoseFirstRate: round(equilibriumPlay.chooserChoseFirstRate),
            averageScore: round(equilibriumPlay.averageScore),
            averageHiddenCards: round(equilibriumPlay.averageHiddenCards),
            averageBonusDraws: round(equilibriumPlay.averageBonusDraws),
        },
        limitations: [
            'This is an approximate equilibrium over the declared policy population, not an exact equilibrium of the full extensive-form game.',
            'The exploitability value only tests best responses inside the population; probe policies are additional stress tests, not an exhaustive best response.',
            'Policies never inspect the identity of an opponent hidden card, but they use public placement and hidden/visible status.',
        ],
    };

    writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${OUTPUT_PATH} in ${result.solver.runtimeSeconds}s.`);
    console.log('Equilibrium mixture:');
    result.strategies
        .filter(strategy => strategy.equilibriumProbability >= 0.001)
        .forEach(strategy => console.log(`  ${strategy.id}: ${(strategy.equilibriumProbability * 100).toFixed(2)}%`));
    console.log(`Population exploitability: ${result.populationExploitability.toFixed(4)}`);
    console.log(`95% upper bound: ${result.populationExploitabilityUpper95.toFixed(4)}`);
    console.log('Out-of-population probes:');
    result.outOfPopulationProbes.forEach(probe => {
        console.log(`  ${probe.id}: ${probe.mean.toFixed(4)} ± ${(1.96 * probe.standardError).toFixed(4)}`);
    });
}

main();
