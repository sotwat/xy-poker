import { INITIAL_GAME_STATE, gameReducer, GameState } from '../src/logic/game';
import { getBestMove, AiParams, DEFAULT_AI_PARAMS } from '../src/logic/ai';

// Mutate parameters slightly for genetic algorithm
function mutateParams(params: AiParams, mutationRate: number = 0.1): AiParams {
    const mutated = { ...params };
    const keys = Object.keys(mutated) as (keyof AiParams)[];
    
    for (const key of keys) {
        if (key === 'mcSimulations') continue; // keep fixed for speed during training
        
        if (Math.random() < mutationRate) {
            // +/- 20% mutation
            const variation = 1 + (Math.random() * 0.4 - 0.2);
            mutated[key] = Math.round(mutated[key] * variation);
        }
    }
    return mutated;
}

function runHeadlessMatch(paramsA: AiParams, paramsB: AiParams): { winner: 0 | 1 | -1, scoreA: number, scoreB: number, turns: number } {
    let state: GameState = gameReducer(INITIAL_GAME_STATE, { 
        type: 'START_GAME',
        payload: {} // Uses random deck and dice
    });

    let turns = 0;
    while (state.phase !== 'ended' && turns < 100) { // Safety limit 100 turns
        turns++;
        const currentPlayerIndex = state.currentPlayerIndex;
        
        // Let AI think
        const currentParams = currentPlayerIndex === 0 ? paramsA : paramsB;
        const move = getBestMove(state, currentPlayerIndex, currentParams);
        
        // Execute move
        state = gameReducer(state, { 
            type: 'PLACE_AND_DRAW', 
            payload: { cardId: move.cardId, colIndex: move.colIndex, isHidden: move.isHidden } 
        });

        // End turn
        state = gameReducer(state, { type: 'END_TURN' });
    }

    if (state.phase !== 'ended') {
        // Force calculation if safety hit
        state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    }

    const p1Score = state.players[0].score;
    const p2Score = state.players[1].score;

    let winner: 0 | 1 | -1 = -1;
    if (p1Score > p2Score) winner = 0;
    else if (p2Score > p1Score) winner = 1;

    return { winner, scoreA: p1Score, scoreB: p2Score, turns };
}

async function runTrainingSession(gamesCount: number = 10) {
    console.log(`Starting AI vs AI Headless Simulator (${gamesCount} games)`);
    
    // Default AI (Champion) vs Mutated AI (Challenger)
    let champParams = { ...DEFAULT_AI_PARAMS };
    // Lower MC for speed during bulk training (Level 1 essentially)
    champParams.mcSimulations = 5; 
    
    let challengerParams = mutateParams(champParams, 0.5); // 50% chance to mutate each param
    challengerParams.mcSimulations = 5;

    let champWins = 0;
    let challengerWins = 0;
    let draws = 0;

    for (let i = 0; i < gamesCount; i++) {
        // Swap starting player to be fair
        const champIsP1 = i % 2 === 0;
        
        const paramsP1 = champIsP1 ? champParams : challengerParams;
        const paramsP2 = champIsP1 ? challengerParams : champParams;

        const result = runHeadlessMatch(paramsP1, paramsP2);

        if (result.winner === 0) {
            if (champIsP1) champWins++; else challengerWins++;
        } else if (result.winner === 1) {
            if (!champIsP1) champWins++; else challengerWins++;
        } else {
            draws++;
        }

        process.stdout.write(`\rMatch ${i + 1}/${gamesCount} | Champ: ${champWins} | Challenger: ${challengerWins} | Draws: ${draws}`);
    }
    
    console.log('\n\n--- Session Complete ---');
    console.log(`Win Rate (Champ): ${((champWins / gamesCount) * 100).toFixed(1)}%`);
    console.log(`Win Rate (Challenger): ${((challengerWins / gamesCount) * 100).toFixed(1)}%`);
    
    if (challengerWins > champWins) {
        console.log('\n🔥 Challenger is better! New optimal weights found:');
        console.log(challengerParams);
    } else {
        console.log('\n🛡️ Champion defended its title. Mutated weights were worse.');
    }
}

// Run 10 games by default for quick test
const gamesToRun = process.argv[2] ? parseInt(process.argv[2], 10) : 10;
runTrainingSession(gamesToRun).catch(console.error);
