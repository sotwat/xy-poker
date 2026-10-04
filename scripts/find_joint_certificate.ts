import { writeFileSync } from 'node:fs';
import { createDeck } from '../src/logic/deck';
import { gameReducer, INITIAL_GAME_STATE } from '../src/logic/game';
import { scoreGtoMove } from '../src/logic/gtoPolicy';
import { findIndependentForcedWinPlan as independent } from '../src/logic/forcedWin';
import { findJointForcedWinPlan } from '../src/logic/jointForcedWin';
let rng = 100210201;
const random = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
const started = performance.now();
const outputPath = process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? '/tmp/xy-joint-discovery.json';
let checked = 0;
for (let game = 0; game < 200; game++) {
    const deck = createDeck();
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    let state = gameReducer(INITIAL_GAME_STATE, { type: 'START_GAME', payload: {
        initialDeck: deck, initialDice: Array.from({ length: 5 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => b - a),
        startingPlayer: game % 2,
    } });
    state = gameReducer(state, { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer: game % 2 } });
    while (state.phase === 'playing') {
        const actor = state.currentPlayerIndex as 0 | 1, own = state.players[actor];
        const remaining = own.board.flat().filter(card => card === null).length;
        if ((remaining === 2 || remaining === 3) && !independent(state, actor)) {
            checked++;
            const plan = findJointForcedWinPlan(state, actor, performance.now() + 50);
            if (plan) {
                const result = { source: { seed: 100210201, game, checked, trajectory: 'public-only heuristic exploratory states' }, state, plan,
                    elapsedSeconds: (performance.now() - started) / 1000 };
                writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
                console.log(JSON.stringify({ ...result, state: undefined, plan: { moves: plan.moves, lowerBound: plan.scoreLowerBound,
                    completions: plan.opponentCompletions } }, null, 2));
                process.exit(0);
            }
        }
        let best = -Infinity, move = { cardId: own.hand[0].id, colIndex: 0, isHidden: false };
        for (const card of own.hand) for (let column = 0; column < 5; column++) {
            if (own.board[2][column]) continue;
            const value = scoreGtoMove(state, actor, card, column) + (random() - 0.5) * 3;
            if (value > best) { best = value; move = { cardId: card.id, colIndex: column, isHidden: false }; }
        }
        const next = gameReducer(state, { type: 'PLACE_AND_DRAW', payload: move });
        if (next === state) throw new Error('Illegal exploratory move');
        state = next;
    }
    if ((game + 1) % 25 === 0) process.stderr.write(`${game + 1}/200, ${checked} checked\n`);
}
console.log(JSON.stringify({ found: false, checked, elapsedSeconds: (performance.now() - started) / 1000 }));
