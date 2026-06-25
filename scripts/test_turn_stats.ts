import { INITIAL_GAME_STATE, gameReducer, GameState } from '../src/logic/game';
import { getBestMove, getBestTurnOrder, DEFAULT_AI_PARAMS, AiParams } from '../src/logic/ai';
import * as fs from 'fs';

let champParams: AiParams = { ...DEFAULT_AI_PARAMS };
try {
    const data = fs.readFileSync('champion.json', 'utf8');
    champParams = JSON.parse(data);
} catch (e) {
    console.log("No champion.json found, using defaults");
}

champParams.mcSimulations = 3; // Keep it fast

let firstPlayerWins = 0;
let secondPlayerWins = 0;
let draws = 0;

const NUM_GAMES = 1000;

for (let i = 0; i < NUM_GAMES; i++) {
    let state: GameState = gameReducer(INITIAL_GAME_STATE, { 
        type: 'START_GAME',
        payload: {} 
    });

    let firstPlayerIndex = -1;
    let turns = 0;

    while (state.phase !== 'ended' && turns < 100) {
        turns++;
        const currentPlayerIndex = state.currentPlayerIndex;

        if (state.phase === 'turn_selection') {
            const goFirst = getBestTurnOrder(state, currentPlayerIndex, champParams);
            firstPlayerIndex = goFirst ? currentPlayerIndex : (1 - currentPlayerIndex);
            state = gameReducer(state, {
                type: 'CHOOSE_TURN_ORDER',
                payload: { startingPlayer: firstPlayerIndex }
            });
            continue; 
        }
        
        if (state.phase === 'scoring') {
            state = gameReducer(state, { type: 'CALCULATE_SCORE' });
            continue;
        }
        
        const move = getBestMove(state, currentPlayerIndex, champParams);
        
        state = gameReducer(state, { 
            type: 'PLACE_AND_DRAW', 
            payload: { cardId: move.cardId, colIndex: move.colIndex, isHidden: move.isHidden } 
        });

        state = gameReducer(state, { type: 'END_TURN' });
    }

    if (state.phase !== 'ended') {
        state = gameReducer(state, { type: 'CALCULATE_SCORE' });
    }

    const p1Score = state.players[0].score;
    const p2Score = state.players[1].score;

    let matchWinner = -1;
    if (p1Score > p2Score) matchWinner = 0;
    else if (p2Score > p1Score) matchWinner = 1;

    if (matchWinner === -1) {
        draws++;
    } else if (matchWinner === firstPlayerIndex) {
        firstPlayerWins++;
    } else {
        secondPlayerWins++;
    }

    process.stdout.write(`\rMatch ${i+1}/${NUM_GAMES} | First Wins: ${firstPlayerWins} | Second Wins: ${secondPlayerWins} | Draws: ${draws}`);
}

console.log("\n\n--- Results ---");
console.log(`Total Matches: ${NUM_GAMES}`);
console.log(`First Player Win Rate: ${((firstPlayerWins / NUM_GAMES) * 100).toFixed(1)}%`);
console.log(`Second Player Win Rate: ${((secondPlayerWins / NUM_GAMES) * 100).toFixed(1)}%`);
console.log(`Draw Rate: ${((draws / NUM_GAMES) * 100).toFixed(1)}%`);
