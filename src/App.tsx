import { useReducer, useState, useEffect, useRef } from 'react';
import { gameReducer, INITIAL_GAME_STATE } from './logic/game';
import { evaluateYHand, evaluateXHand } from './logic/evaluation';
import { calculateXHandScores } from './logic/scoring';
import { recordGameResult } from './logic/aiLearning';
import type { Card } from './logic/types';
import { SharedBoard } from './components/SharedBoard';
import { Hand } from './components/Hand';
import { GameInfo } from './components/GameInfo';
import { GameResult } from './components/GameResult';
import { Lobby } from './components/Lobby';
import { socket, connectSocket } from './logic/online';
import './App.css';

import { getBestMove } from './logic/ai';

function App() {
  const [gameState, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [placeHidden, setPlaceHidden] = useState(false);

  // Online State
  const [mode, setMode] = useState<'local' | 'online'>('local');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerRole, setPlayerRole] = useState<'host' | 'guest' | null>(null);
  const [isOnlineGame, setIsOnlineGame] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [showResultsModal, setShowResultsModal] = useState(false);

  // Player Names
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('xypoker_playerName') || 'Player 1';
  });
  const [opponentName, setOpponentName] = useState('Player 2');

  // Use ref to track playerRole for event handlers
  const playerRoleRef = useRef(playerRole);
  useEffect(() => {
    playerRoleRef.current = playerRole;
  }, [playerRole]);

  // Initialize Socket
  useEffect(() => {
    connectSocket();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    socket.on('player_joined', () => {
      console.log('[Game] Player joined! Current role:', playerRoleRef.current);
      if (playerRoleRef.current === 'host') {
        // Player joined, enter "Setup" phase in Online mode
        // This triggers the Sync Effect below, sending 'setup' state to guest
        setIsOnlineGame(true);
      }
    });

    socket.on('sync_state', (remoteState: any) => { // remoteState should be GameState
      dispatch({ type: 'SYNC_STATE', payload: remoteState } as any);
      setIsOnlineGame(true);
    });

    socket.on('game_action', (action: any) => {
      dispatch(action);
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('player_joined');
      socket.off('sync_state');
      socket.off('game_action');
      // Don't disconnect on cleanup - only when component unmounts
    };
  }, []); // Empty dependency array - only run once on mount

  // Sync State on Change (Host only)
  useEffect(() => {
    if (isOnlineGame && playerRole === 'host' && roomId) {
      socket.emit('sync_state', { roomId, state: gameState });
    }
  }, [gameState, isOnlineGame, playerRole, roomId]);


  const { currentPlayerIndex, players, phase } = gameState;
  const currentPlayer = players[currentPlayerIndex];

  // AI Turn Logic (Only in Local Mode)
  useEffect(() => {
    if (mode === 'local' && phase === 'playing' && currentPlayerIndex === 1) {
      // AI is Player 2
      const timer = setTimeout(() => {
        // 1. Calculate Move
        const move = getBestMove(gameState, 1);

        // 2. Place Card & Draw (Atomic)
        dispatch({
          type: 'PLACE_AND_DRAW',
          payload: {
            cardId: move.cardId,
            colIndex: move.colIndex,
            isHidden: move.isHidden
          }
        });

      }, 1000); // 1s delay before AI starts acting

      return () => clearTimeout(timer);
    }
  }, [phase, currentPlayerIndex, gameState, mode]); // Depend on gameState to re-eval if needed, but mainly index.

  useEffect(() => {
    if (phase === 'scoring') {
      // Auto-calculate score after a short delay or immediately
      // Let's add a button to "Reveal & Score" instead of auto
    }
  }, [phase]);

  // Show results modal when game ends
  useEffect(() => {
    if (phase === 'ended') {
      setShowResultsModal(true);

      // Record AI learning data in local mode
      if (mode === 'local') {
        const { winner } = gameState;
        const aiWon = winner === 'p2';
        const isDraw = winner === null;
        recordGameResult(aiWon, isDraw);
      }
    }
  }, [phase, mode, gameState]);

  // Save player name to localStorage
  useEffect(() => {
    localStorage.setItem('xypoker_playerName', playerName);
  }, [playerName]);

  // Update opponent name based on mode
  useEffect(() => {
    if (mode === 'local') {
      setOpponentName('AI');
    } else if (mode === 'online' && !isOnlineGame) {
      setOpponentName('Player 2');
    }
  }, [mode, isOnlineGame]);

  const handleStartGame = () => {
    dispatch({ type: 'START_GAME' });
    setShowResultsModal(false);
  };

  const handlePlayerNameChange = (name: string) => {
    setPlayerName(name);
  };

  const handleCreateRoom = () => {
    socket.emit('create_room', (response: any) => {
      setRoomId(response.roomId);
      setPlayerRole('host');
    });
  };

  const handleJoinRoom = (id: string) => {
    socket.emit('join_room', id, (response: any) => {
      if (response.success) {
        setRoomId(id);
        setPlayerRole('guest');
      } else {
        alert(response.message);
      }
    });
  };

  const handleQuickMatch = () => {
    socket.emit('quick_match', (response: any) => {
      if (response.success) {
        setRoomId(response.roomId);
        setPlayerRole(response.role);
        setIsOnlineGame(true);
        // If waiting for opponent, user will see setup screen
      }
    });
  };

  const calculateWinningColumns = (): ('p1' | 'p2' | 'draw')[] => {
    const { players } = gameState;
    const p1 = players[0];
    const p2 = players[1];
    const dice = p1.dice;

    return Array.from({ length: 5 }, (_, colIndex) => {
      const p1Cards = [p1.board[0][colIndex]!, p1.board[1][colIndex]!, p1.board[2][colIndex]!];
      const p2Cards = [p2.board[0][colIndex]!, p2.board[1][colIndex]!, p2.board[2][colIndex]!];

      const p1Res = evaluateYHand(p1Cards, dice[colIndex]);
      const p2Res = evaluateYHand(p2Cards, dice[colIndex]);

      if (p1Res.rankValue > p2Res.rankValue) return 'p1';
      if (p2Res.rankValue > p1Res.rankValue) return 'p2';

      // Tie-break with kickers
      for (let k = 0; k < Math.max(p1Res.kickers.length, p2Res.kickers.length); k++) {
        const k1 = p1Res.kickers[k] || 0;
        const k2 = p2Res.kickers[k] || 0;
        if (k1 > k2) return 'p1';
        if (k2 > k1) return 'p2';
      }

      return 'draw';
    });
  };

  const calculateXWinner = (): 'p1' | 'p2' | 'draw' => {
    const { players } = gameState;
    const p1 = players[0];
    const p2 = players[1];

    const p1XRes = evaluateXHand(p1.board[2] as Card[]);
    const p2XRes = evaluateXHand(p2.board[2] as Card[]);

    const { p1Score: p1XScore, p2Score: p2XScore } = calculateXHandScores(p1XRes, p2XRes);

    if (p1XScore > p2XScore) return 'p1';
    if (p2XScore > p1XScore) return 'p2';
    return 'draw';
  };

  const handleCardSelect = (cardId: string) => {
    // Determine current player's index based on mode
    let myPlayerIndex = 0; // Default for local P1
    if (isOnlineGame) {
      myPlayerIndex = playerRole === 'host' ? 0 : 1;
    }

    if (currentPlayerIndex !== myPlayerIndex) return; // Prevent selecting during opponent's turn
    if (selectedCardId === cardId) {
      setSelectedCardId(null);
    } else {
      setSelectedCardId(cardId);
    }
  };

  const handleColumnClick = (colIndex: number) => {
    if (phase !== 'playing') return;
    if (!selectedCardId) return; // Must have a card selected

    // Determine current player's index based on mode
    let myPlayerIndex = 0; // Default for local P1
    if (isOnlineGame) {
      myPlayerIndex = playerRole === 'host' ? 0 : 1;
    }

    if (currentPlayerIndex !== myPlayerIndex) return; // Not my turn

    const action = {
      type: 'PLACE_AND_DRAW',
      payload: {
        cardId: selectedCardId,
        colIndex,
        isHidden: placeHidden,
      }
    };
    dispatch(action as any); // Dispatch locally

    if (isOnlineGame && roomId) {
      socket.emit('game_action', { roomId, action }); // Emit to server for other players
    }

    setSelectedCardId(null);
    setPlaceHidden(false);
  };

  // const handleDraw = () => { // Removed as draw is automatic
  //   if (currentPlayerIndex !== 0) return;
  //   dispatch({ type: 'DRAW_CARD' });
  // };

  const handleCalculateScore = () => {
    dispatch({ type: 'CALCULATE_SCORE' });
  };

  // Removed hasPlaced state logic as draw is automatic.
  // The extensive comment block about `hasPlaced` and turn flow is also removed.
  // useEffect(() => {
  //   setHasPlaced(false);
  // }, [gameState.turnCount, gameState.currentPlayerIndex]);

  // Also reset selection
  useEffect(() => {
    setSelectedCardId(null);
    setPlaceHidden(false);
  }, [gameState.currentPlayerIndex]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>XY Poker</h1>
        {((mode === 'local' && phase === 'setup') || (mode === 'online' && !isOnlineGame)) && (
          <div className="mode-switch">
            <button
              className={mode === 'local' ? 'active' : ''}
              onClick={() => { setMode('local'); setIsOnlineGame(false); setRoomId(null); setPlayerRole(null); }}
            >
              Local (vs AI)
            </button>
            <button
              className={mode === 'online' ? 'active' : ''}
              onClick={() => setMode('online')}
            >
              Online
            </button>
          </div>
        )}
        <GameInfo
          gameState={gameState}
          isOnlineMode={mode === 'online'}
          playerRole={playerRole}
          playerName={playerName}
          opponentName={opponentName}
        />
      </header>

      {mode === 'online' && !isOnlineGame ? (
        <Lobby
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onQuickMatch={handleQuickMatch}
          roomId={roomId}
          isConnected={isConnected}
          playerRole={playerRole}
          playerName={playerName}
          onPlayerNameChange={handlePlayerNameChange}
        />
      ) : (
        <>
          <main className="game-board">
            {phase === 'setup' && (
              <div className="setup-screen">
                {mode === 'local' || (mode === 'online' && playerRole === 'host') ? (
                  <button className="btn-primary" onClick={handleStartGame}>Start Game</button>
                ) : (
                  <div className="waiting-message">
                    <h3>Waiting for Host to start game...</h3>
                    <div className="loading-spinner"></div>
                  </div>
                )}
              </div>
            )}
            {(phase === 'playing' || phase === 'scoring' || phase === 'ended') && (
              <div className="play-area">
                <SharedBoard
                  playerBoard={players[isOnlineGame && playerRole === 'guest' ? 1 : 0].board}
                  opponentBoard={players[isOnlineGame && playerRole === 'guest' ? 0 : 1].board}
                  dice={players[0].dice} // Shared dice
                  onColumnClick={handleColumnClick}
                  isCurrentPlayer={phase === 'playing' && currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0)}
                  revealAll={phase === 'ended'}
                  winningColumns={phase === 'ended' ? calculateWinningColumns() : undefined}
                  xWinner={phase === 'ended' ? calculateXWinner() : undefined}
                />
              </div>
            )}
          </main>

          <footer className="controls">

            {phase === 'playing' && (
              <>
                <div className="hand-container">
                  <Hand
                    hand={players[isOnlineGame && playerRole === 'guest' ? 1 : 0].hand}
                    selectedCardId={selectedCardId}
                    onCardSelect={handleCardSelect}
                    isCurrentPlayer={currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0)}
                  />
                </div>

                <div className="action-bar">
                  <div className="place-controls">
                    <label className="toggle-hidden">
                      <input
                        type="checkbox"
                        checked={placeHidden}
                        onChange={(e) => setPlaceHidden(e.target.checked)}
                        disabled={!selectedCardId || currentPlayer.hiddenCardsCount >= 3}
                      />
                      Place Face Down ({3 - currentPlayer.hiddenCardsCount} left)
                    </label>
                    <div className="instruction">
                      {selectedCardId ? "Click a column to place" : "Select a card from your hand"}
                    </div>
                  </div>
                </div>
              </>
            )}

            {phase === 'scoring' && (
              <button className="btn-primary" onClick={handleCalculateScore}>
                Reveal & Calculate Scores
              </button>
            )}

            {phase === 'ended' && !showResultsModal && (
              <button className="btn-primary" onClick={() => setShowResultsModal(true)}>
                Show Results
              </button>
            )}

            {phase === 'ended' && showResultsModal && (
              <GameResult
                gameState={gameState}
                onRestart={handleStartGame}
                onClose={() => setShowResultsModal(false)}
                playerName={playerName}
                opponentName={opponentName}
              />
            )}
          </footer>
        </>
      )}
    </div>
  );
}

export default App;
