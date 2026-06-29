// AI Learning System - stores and learns from game outcomes

interface LearningData {
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    // Strategy weights that evolve over time
    tripPreference: number;
    flushPreference: number;
    straightPreference: number;
    xHandFocus: number;
    bonusAggression: number;
    hidingStrategy: number;
    defensiveAwareness: number;
}

const DEFAULT_LEARNING_DATA: LearningData = {
    totalGames: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    tripPreference: 1.200,
    flushPreference: 1.150,
    straightPreference: 1.050,
    xHandFocus: 1.250,
    bonusAggression: 1.400,
    hidingStrategy: 0.3,
    defensiveAwareness: 1.300,
};

const STORAGE_KEY = 'xypoker_ai_learning';

export function getLearningData(): LearningData {
    try {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                return { ...DEFAULT_LEARNING_DATA, ...data };
            }
        }
    } catch (e) {
        console.error('Failed to load AI learning data:', e);
    }
    return { ...DEFAULT_LEARNING_DATA };
}

function saveLearningData(data: LearningData): void {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    } catch (e) {
        console.error('Failed to save AI learning data:', e);
    }
}

export function recordGameResult(aiWon: boolean, isDraw: boolean = false): void {
    const data = getLearningData();

    data.totalGames += 1;

    if (isDraw) {
        data.draws += 1;
    } else if (aiWon) {
        data.wins += 1;
        // AI won - reinforce current strategy slightly
        data.tripPreference *= 1.05;
        data.flushPreference *= 1.05;
        data.straightPreference *= 1.05;
        data.xHandFocus *= 1.05;
        data.bonusAggression *= 1.05;
    } else {
        data.losses += 1;
        // AI lost - try different strategy
        // Reduce weaker preferences, boost others
        const strategies = [
            { name: 'tripPreference', value: data.tripPreference },
            { name: 'flushPreference', value: data.flushPreference },
            { name: 'straightPreference', value: data.straightPreference },
            { name: 'xHandFocus', value: data.xHandFocus },
            { name: 'bonusAggression', value: data.bonusAggression },
        ];

        // Find weakest strategy (lowest preference)
        strategies.sort((a, b) => a.value - b.value);
        const weakest = strategies[0].name as keyof LearningData;
        const strongest = strategies[strategies.length - 1].name as keyof LearningData;

        // Boost weakest, maintain strongest
        (data[weakest] as number) *= 1.1;
        (data[strongest] as number) *= 0.95;

        // Increase aggression when losing
        data.bonusAggression *= 1.08;
    }

    // Cap preferences to reasonable ranges
    data.tripPreference = Math.min(Math.max(data.tripPreference, 0.5), 2.0);
    data.flushPreference = Math.min(Math.max(data.flushPreference, 0.5), 2.0);
    data.straightPreference = Math.min(Math.max(data.straightPreference, 0.5), 2.0);
    data.xHandFocus = Math.min(Math.max(data.xHandFocus, 0.5), 2.0);
    data.bonusAggression = Math.min(Math.max(data.bonusAggression, 0.5), 2.5);
    data.hidingStrategy = Math.min(Math.max(data.hidingStrategy, 0.1), 0.6);

    saveLearningData(data);
}

export function getWinRate(): number {
    const data = getLearningData();
    if (data.totalGames === 0) return 0;
    return data.wins / data.totalGames;
}

export function resetLearningData(): void {
    localStorage.removeItem(STORAGE_KEY);
}

export function getAIStats(): { games: number; wins: number; losses: number; draws: number; winRate: number } {
    const data = getLearningData();
    return {
        games: data.totalGames,
        wins: data.wins,
        losses: data.losses,
        draws: data.draws,
        winRate: getWinRate(),
    };
}
