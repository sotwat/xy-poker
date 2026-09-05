import { createRoot } from 'react-dom/client';
import { Maximize2 } from 'lucide-react';
import '../index.css';
import '../App';
import { GameInfo } from '../components/GameInfo';
import { SharedBoard } from '../components/SharedBoard';
import { Hand } from '../components/Hand';
import { TurnTimer } from '../components/TurnTimer';
import { I18nProvider } from '../i18n';
import { INITIAL_GAME_STATE } from '../logic/game';
import type { Card, GameState, Rank, Suit } from '../logic/types';
import { homeLettering } from '../homeLettering';
import { uiPalette } from '../uiPalette';

const makeCard = (rank: Rank, suit: Suit): Card => ({ id: `${rank}-${suit}`, rank, suit });
const playerBoard = [
    [makeCard(14, 'spades'), makeCard(10, 'hearts'), makeCard(13, 'clubs'), makeCard(8, 'diamonds'), makeCard(3, 'spades')],
    [null, makeCard(11, 'hearts'), null, makeCard(8, 'clubs'), null],
    [null, null, null, null, null],
];
const opponentBoard = [
    [makeCard(12, 'hearts'), makeCard(7, 'clubs'), makeCard(13, 'diamonds'), makeCard(6, 'spades'), makeCard(5, 'hearts')],
    [makeCard(12, 'clubs'), null, null, null, makeCard(4, 'hearts')],
    [null, null, null, null, null],
];
const hand = [makeCard(14, 'clubs'), makeCard(12, 'diamonds'), makeCard(10, 'spades'), makeCard(9, 'hearts'), makeCard(2, 'clubs')];
const sampleState: GameState = {
    ...INITIAL_GAME_STATE,
    phase: 'playing' as const,
    players: [
        { ...INITIAL_GAME_STATE.players[0], board: playerBoard, hand },
        { ...INITIAL_GAME_STATE.players[1], board: opponentBoard },
    ],
};
const noAction = () => {};

createRoot(document.getElementById('root')!).render(
    <I18nProvider manageDocumentMetadata={false}>
        <div className="app view-game phase-playing" data-geometry="angular" data-palette={uiPalette} inert aria-label="Non-interactive table color sample">
            <header className="app-header battle-mode">
                <div className="header-title-row"><h1 className="game-wordmark"><img src={homeLettering.wordmark} alt="XY Poker" /></h1></div>
                <button type="button" className="btn-fullscreen" aria-label="Fullscreen"><Maximize2 /></button>
            </header>
            <GameInfo gameState={sampleState} playerName="YOU" opponentName="AI" isPremium onToggleAuto={noAction} onSurrender={noAction} />
            <div className="game-status-bar"><TurnTimer timeLeft={42} currentPlayerIndex={0} isMyTurn /></div>
            <main className="game-board">
                <div className="play-area" data-bottom-player="1">
                    <div className="table-seat table-seat-opponent"><span>AI</span></div>
                    <div className="table-surface">
                        <SharedBoard playerBoard={playerBoard} opponentBoard={opponentBoard} dice={[6, 3, 5, 2, 4]} onColumnClick={noAction} isCurrentPlayer hasSelectedCard selectedSkin="white" selectedCardSkin="classic" selectedBoardSkin="classic-green" />
                    </div>
                    <div className="table-seat table-seat-player"><span>YOU</span></div>
                </div>
            </main>
            <footer className="controls">
                <div className="hand-container"><Hand hand={hand} selectedCardId={hand[0].id} onCardSelect={noAction} isCurrentPlayer /></div>
                <div className="action-bar"><div className="place-controls"><label className="toggle-hidden"><input type="checkbox" readOnly /><span>FACE DOWN · 3</span></label></div><button type="button" className="pro-thought-trigger"><span>PRO</span>Notes</button></div>
            </footer>
        </div>
    </I18nProvider>,
);
