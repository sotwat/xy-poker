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
import { generateRandomPlayerName } from './logic/nameGenerator';

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
  const [isQuickMatch, setIsQuickMatch] = useState(false);

  // Player Names - Generate random name for uniqueness
  const [playerName, setPlayerName] = useState(() => {
    const saved = localStorage.getItem('xypoker_playerName');
    return saved || generateRandomPlayerName();
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

    socket.on('auto_start_game', () => {
      console.log('Auto-starting Quick Match game');
      setIsQuickMatch(false); // Reset flag to allow transition to game
      dispatch({ type: 'START_GAME' });
    });

    socket.on('opponent_joined', ({ opponentName }) => {
      console.log('Opponent joined:', opponentName);
      setOpponentName(opponentName);
    });

    socket.on('game_action', (action: any) => {
      dispatch(action);
    });

    socket.on('game_end_surrender', ({ winner }) => {
      // Handle surrender ending the game
      console.log('[SURRENDER] Received game_end_surrender event, winner:', winner);

      // Return to lobby after 1 second (showing winner briefly)
      setTimeout(() => {
        console.log('[SURRENDER] Returning to lobby - resetting ALL state');
        // Reset all state at once using functional updates
        setMode(() => 'online');
        setRoomId(() => null);
        setPlayerRole(() => null);
        setIsOnlineGame(() => false);
        setIsQuickMatch(() => false);
        setOpponentName(() => 'Player 2');

        // Reset game state to initial
        dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
        console.log('[SURRENDER] State reset complete - should show lobby');
      }, 1000);
    });

    socket.on('player_left', () => {
      // Opponent left/cancelled - return to lobby
      console.log('Opponent left the room');
      setMode('online');
      setRoomId(null);
      setPlayerRole(null);
      setIsOnlineGame(false);
      setIsQuickMatch(false);
      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('player_joined');
      socket.off('sync_state');
      socket.off('auto_start_game');
      socket.off('opponent_joined');
      socket.off('game_action');
      socket.off('game_end_surrender');
      socket.off('player_left');
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
    socket.emit('create_room', { playerName }, (response: any) => {
      setRoomId(response.roomId);
      setPlayerRole('host');
    });
  };

  const handleJoinRoom = (id: string) => {
    socket.emit('join_room', { roomId: id, playerName }, (response: any) => {
      if (response.success) {
        setRoomId(id);
        setPlayerRole('guest');
        if (response.opponentName) {
          setOpponentName(response.opponentName);
        }
      } else {
        alert(response.message);
      }
    });
  };

  const handleQuickMatch = () => {
    // Set Quick Match mode immediately for UI update
    setIsQuickMatch(true);

    socket.emit('quick_match', { playerName }, (response: any) => {
      if (response.success) {
        setRoomId(response.roomId);
        setPlayerRole(response.role);
        setIsOnlineGame(true);
        if (response.opponentName) {
          setOpponentName(response.opponentName);
        }
        // If waiting for opponent, user will see waiting screen
      } else {
        setIsQuickMatch(false); // Reset on error
      }
    });
  };

  const handleCancelMatchmaking = () => {
    // Cancel matchmaking and return to lobby
    socket.emit('cancel_matchmaking', { roomId });
    setRoomId(null);
    setPlayerRole(null);
    setIsQuickMatch(false);
    setIsOnlineGame(false);
  };

  const handleSurrender = () => {
    if (!window.confirm('降参しますか？ゲームを終了します。')) {
      return;
    }

    if (mode === 'local') {
      // Local mode: Reset to initial state immediately
      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
    } else {
      // Online mode: notify server (server will send game_end_surrender to both players)
      socket.emit('surrender', { roomId });
    }
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
        <h1>XY Poker <span className="version">12061152</span></h1>
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
          onSurrender={handleSurrender}
        />
      </header>

      {mode === 'online' && isQuickMatch ? (
        <div className="setup-screen">
          <div className="waiting-message">
            <h3>🎲 Quick Match</h3>
            <h2>Waiting for opponent...</h2>
            <div className="loading-spinner"></div>
            <p>Your game will start automatically when an opponent joins</p>
            <button className="btn-cancel" onClick={handleCancelMatchmaking}>
              キャンセル
            </button>
          </div>
        </div>
      ) : mode === 'online' && !isOnlineGame ? (
        <Lobby
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onQuickMatch={handleQuickMatch}
          onCancelMatchmaking={handleCancelMatchmaking}
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
                {isQuickMatch ? (
                  <div className="waiting-message">
                    <h3>🎲 Quick Match</h3>
                    <h2>Waiting for opponent...</h2>
                    <div className="loading-spinner"></div>
                    <p>Your game will start automatically when an opponent joins</p>
                  </div>
                ) : mode === 'local' || (mode === 'online' && playerRole === 'host') ? (
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
