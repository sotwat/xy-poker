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

async function runTrainingSession(gamesCount: number, champParams: AiParams, challengerParams: AiParams) {
    let champWins = 0;
    let challengerWins = 0;
    let draws = 0;

    for (let i = 0; i < gamesCount; i++) {
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
    
    return { champWins, challengerWins, draws };
}

async function continuousTraining() {
    console.log(`Starting Continuous AI Evolution...`);
    let champParams = { ...DEFAULT_AI_PARAMS };
    champParams.mcSimulations = 5; 

    let consecutiveDefenses = 0;
    let generation = 1;
    const gamesPerGen = 20;
    const maxDefenses = 100;

    while (consecutiveDefenses < maxDefenses) {
        console.log(`\n--- Generation ${generation} (Defenses: ${consecutiveDefenses}) ---`);
        let challengerParams = mutateParams(champParams, 0.4);
        challengerParams.mcSimulations = 5;

        const result = await runTrainingSession(gamesPerGen, champParams, challengerParams);

        if (result.challengerWins > result.champWins) {
            console.log('\n🔥 Challenger is better! New optimal weights found:');
            console.log(challengerParams);
            champParams = { ...challengerParams };
            consecutiveDefenses = 0;
            
            // Save to file
            const fs = await import('fs');
            fs.writeFileSync('champion.json', JSON.stringify(champParams, null, 2));
            console.log('Saved new champion.json');
        } else {
            consecutiveDefenses++;
        }
        generation++;
    }

    console.log(`\n🏁 Evolution stopped. Champion defended ${maxDefenses} times in a row, likely reaching a local maxima.`);
}

const arg = process.argv[2];
if (arg === 'continuous') {
    continuousTraining().catch(console.error);
} else {
    const gamesToRun = arg ? parseInt(arg, 10) : 10;
    runTrainingSession(gamesToRun, { ...DEFAULT_AI_PARAMS, mcSimulations: 5 }, mutateParams({ ...DEFAULT_AI_PARAMS, mcSimulations: 5 }))
        .then(res => {
            console.log('\n\n--- Session Complete ---');
            console.log(`Win Rate (Champ): ${((res.champWins / gamesToRun) * 100).toFixed(1)}%`);
            console.log(`Win Rate (Challenger): ${((res.challengerWins / gamesToRun) * 100).toFixed(1)}%`);
        }).catch(console.error);
}
