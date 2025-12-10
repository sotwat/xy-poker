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
import { DiceRollOverlay } from './components/DiceRollOverlay';
import { RulesModal } from './components/RulesModal';
import { socket, connectSocket } from './logic/online';
import './App.css';

import { getBestMove } from './logic/ai';
import { generateRandomPlayerName } from './logic/nameGenerator';
import { playClickSound, playSuccessSound } from './utils/sound';
import { getBrowserId } from './utils/identity';

function App() {
  const [gameState, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [placeHidden, setPlaceHidden] = useState(false);
  const [showDiceAnimation, setShowDiceAnimation] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Online State
  const [mode, setMode] = useState<'local' | 'online'>('local');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerRole, setPlayerRole] = useState<'host' | 'guest' | null>(null);
  const [isOnlineGame, setIsOnlineGame] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [isQuickMatch, setIsQuickMatch] = useState(false);

  // Rating State
  const [myRating, setMyRating] = useState<number | null>(null);
  const [ratingUpdates, setRatingUpdates] = useState<any>(null);

  // Player Names - Generate random name for uniqueness
  const [playerName, setPlayerName] = useState(() => {
    const saved = localStorage.getItem('xypoker_playerName_v2'); // Reset names by changing key
    return saved || generateRandomPlayerName();
  });
  const [opponentName, setOpponentName] = useState('Player 2');

  // Refs for accessing reliable state in event listeners
  const modeRef = useRef(mode);
  const roomIdRef = useRef(roomId);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // Use ref to track playerRole for event handlers
  const playerRoleRef = useRef(playerRole);
  useEffect(() => {
    playerRoleRef.current = playerRole;
  }, [playerRole]);

  // Use ref for isQuickMatch to access in socket listeners
  const isQuickMatchRef = useRef(isQuickMatch);
  useEffect(() => {
    isQuickMatchRef.current = isQuickMatch;
  }, [isQuickMatch]);

  // Timeout ref for Quick Match Bot Fallback
  const quickMatchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    // Clear timeout if quick match ends (game starts or cancelled)
    if (!isQuickMatch && quickMatchTimeoutRef.current) {
      clearTimeout(quickMatchTimeoutRef.current);
      quickMatchTimeoutRef.current = null;
    }
  }, [isQuickMatch]);


  // Initialize Socket
  useEffect(() => {
    connectSocket();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // When we join quick match queue, server returns our rating
    socket.on('quick_match_joined', (data: any = {}) => {
      // data.rating might be present if server sends it
      if (data.rating) {
        setMyRating(data.rating);
      }
      setIsQuickMatch(true);
      // Note: lobby logic handles the "Waiting" UI
    });

    socket.on('player_joined', ({ roomId, role }) => {
      setRoomId(roomId);
      setPlayerRole(role);
      setIsOnlineGame(true);
      setMode('online');
    });

    socket.on('sync_state', (remoteState: any) => { // remoteState should be GameState
      dispatch({ type: 'SYNC_STATE', payload: remoteState } as any);
      setIsOnlineGame(true);
    });

    socket.on('auto_start_game', () => {
      console.log('Auto-starting Quick Match game');
      setIsQuickMatch(false);
      setIsOnlineGame(true);
      playSuccessSound();

      // Both host and guest should start the game locally
      dispatch({ type: 'START_GAME' });
      setShowDiceAnimation(true);
      setShowResultsModal(false);
    });

    socket.on('opponent_joined', ({ name }) => {
      setOpponentName(name);
      playSuccessSound();
    });

    socket.on('game_start', ({ roomId, initialDice, p1Name, p2Name, p1Id, p2Id }: any) => {
      setRoomId(roomId);
      // Determine if we should show animation (yes for everyone)
      setIsQuickMatch(false);
      setIsOnlineGame(true);
      playSuccessSound();

      // Robustly set Role and Opponent Name from server authoritative data
      if (socket.id === p1Id) {
        setPlayerRole('host');
        setOpponentName(p2Name || 'Player 2');
      } else if (socket.id === p2Id) {
        setPlayerRole('guest');
        setOpponentName(p1Name || 'Player 1');
      }

      dispatch({ type: 'START_GAME', payload: { initialDice } });
      setShowDiceAnimation(true);
      setShowResultsModal(false);
    });

    socket.on('player_data', (data: any) => {
      if (data && data.rating) {
        setMyRating(data.rating);
      }
    });

    socket.on('rating_update', (updates: any) => {
      console.log('Rating updates received:', updates);
      setRatingUpdates(updates);

      // Update local rating state immediately so Lobby shows correct value
      if (playerRoleRef.current === 'host') {
        setMyRating(updates.p1.new);
      } else if (playerRoleRef.current === 'guest') {
        setMyRating(updates.p2.new);
      }
    });

    socket.on('game_action', (action: any) => {
      dispatch(action);
    });

    socket.on('game_end_surrender', ({ winner }) => {
      // Ignore if we are in local mode (bot match)
      if (modeRef.current === 'local') return;

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
        setRatingUpdates(null); // Clear rating updates

        // Reset game state to initial
        dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
        console.log('[SURRENDER] State reset complete - should show lobby');
      }, 1000);
    });

    socket.on('player_left', () => {
      // Ignore if we are in local mode (bot match)
      // This is critical because cancelling matchmaking might trigger player_left from server
      if (modeRef.current === 'local') {
        console.log('Ignored player_left event because we are in local mode');
        return;
      }

      // Opponent left/cancelled - return to lobby
      console.log('Opponent left the room');
      setMode('online');
      setRoomId(null);
      setPlayerRole(null);
      setIsOnlineGame(false);
      setIsQuickMatch(false);
      setRatingUpdates(null);
      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('quick_match_joined');
      socket.off('game_start');
      socket.off('player_data'); // Clean up
      socket.off('rating_update');
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

  // Fetch rating on connect
  useEffect(() => {
    if (isConnected) {
      const id = getBrowserId(); // Use utility to get or create
      socket.emit('get_player_data', { browserId: id });
    }
  }, [isConnected]);

  // Sync State on Change (Host only)
  useEffect(() => {
    if (isOnlineGame && playerRole === 'host' && roomId) {
      socket.emit('sync_state', { roomId, state: gameState });
    }
  }, [gameState, isOnlineGame, playerRole, roomId]);

  // Rating: Handle Game End Report (Host only)
  useEffect(() => {
    if (isOnlineGame && playerRole === 'host' && roomId && gameState.phase === 'ended' && gameState.winner !== null) {
      socket.emit('report_game_end', {
        roomId,
        winner: gameState.winner,
        p1Score: gameState.players[0].score,
        p2Score: gameState.players[1].score
      });
    }
  }, [gameState.phase, gameState.winner, isOnlineGame, playerRole, roomId]);

  const { currentPlayerIndex, players, phase } = gameState;
  const currentPlayer = players[currentPlayerIndex];

  // Determine if we are in the Lobby view (where version and title inputs are shown)
  // Lobby view is:
  // 1. Local mode AND Setup phase
  // 2. Online mode AND Not in a game AND Not waiting for Quick Match
  // Note: Quick Match waiting screen is NOT the lobby.
  // Lobby view is ONLY for Online mode initialization
  // Local mode setup is handled by the game board view (with setup overlay)
  const isLobbyView = mode === 'online' && !isOnlineGame && !isQuickMatch;
  const showVersion = isLobbyView || (mode === 'local' && phase === 'setup');

  const p1DisplayName = isOnlineGame && playerRole === 'guest' ? opponentName : playerName;
  const p2DisplayName = isOnlineGame && playerRole === 'guest' ? playerName : opponentName;

  // AI Turn Logic (Example)
  useEffect(() => {
    if (mode === 'local' && phase === 'playing' && currentPlayerIndex === 1) {
      const timer = setTimeout(() => {
        const move = getBestMove(gameState, 1);
        dispatch({
          type: 'PLACE_AND_DRAW',
          payload: {
            cardId: move.cardId,
            colIndex: move.colIndex,
            isHidden: move.isHidden
          }
        });
        playClickSound();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState, mode]);

  useEffect(() => {
    if (phase === 'ended') {
      setShowResultsModal(true);
      if (mode === 'local') {
        const { winner } = gameState;
        const aiWon = winner === 'p2';
        const isDraw = winner === null;
        recordGameResult(aiWon, isDraw);
      }
    }
  }, [phase, mode, gameState]);

  useEffect(() => {
    localStorage.setItem('xypoker_playerName_v2', playerName);
  }, [playerName]);

  useEffect(() => {
    if (mode === 'local') {
      setOpponentName('AI');
    } else if (mode === 'online' && !isOnlineGame) {
      setOpponentName('Player 2');
    }
  }, [mode, isOnlineGame]);

  const handleStartGame = () => {
    playClickSound();
    dispatch({ type: 'START_GAME' });
    setShowDiceAnimation(true);
    setShowResultsModal(false);
  };

  const startBotMatch = () => {
    console.log('Quick Match Timeout: Starting Bot Match');

    // Get current roomId using ref
    const currentRoomId = roomIdRef.current;

    // Cancel socket request
    if (currentRoomId) {
      console.log(`Cancelling matchmaking for roomId: ${currentRoomId}`);
      socket.emit('cancel_matchmaking', { roomId: currentRoomId });
    } else {
      console.log('No roomId found to cancel matchmaking.');
    }

    // Switch to Local Mode vs AI
    setIsQuickMatch(false);
    setMode('local');
    setRoomId(null);
    setPlayerRole(null);
    setIsOnlineGame(false);
    setOpponentName('AI (Bot)');

    // Reset state and start
    dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);

    // Slight delay to allow state updates before starting
    setTimeout(() => {
      playSuccessSound();
      dispatch({ type: 'START_GAME' });
      setShowDiceAnimation(true);
    }, 500);
  };

  const handleCreateRoom = () => {
    const browserId = getBrowserId();
    socket.emit('create_room', { playerName, browserId }, (response: any) => {
      setRoomId(response.roomId);
      setPlayerRole('host');
    });
  };

  const handleJoinRoom = (id: string) => {
    const browserId = getBrowserId();
    socket.emit('join_room', { roomId: id, playerName, browserId }, (response: any) => {
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
    setIsQuickMatch(true);

    // Start 15s Timer
    if (quickMatchTimeoutRef.current) clearTimeout(quickMatchTimeoutRef.current);
    quickMatchTimeoutRef.current = setTimeout(() => {
      startBotMatch();
    }, 15000);

    const browserId = getBrowserId();
    socket.emit('quick_match', { playerName, browserId }, (response: any) => {
      if (response.success) {
        // NOTE: response.roomId should be set immediately
        setRoomId(response.roomId);
        setPlayerRole(response.role);
        setIsOnlineGame(true);
        if (response.opponentName) {
          setOpponentName(response.opponentName);
        }
        // DO NOT clear timer here. We are just in the queue.
        // Timer clears only on game_start or cancel.
      } else {
        setIsQuickMatch(false);
        if (quickMatchTimeoutRef.current) {
          clearTimeout(quickMatchTimeoutRef.current);
          quickMatchTimeoutRef.current = null;
        }
      }
    });
  };

  const handleCancelMatchmaking = () => {
    playClickSound();
    if (quickMatchTimeoutRef.current) {
      clearTimeout(quickMatchTimeoutRef.current);
      quickMatchTimeoutRef.current = null;
    }
    socket.emit('cancel_matchmaking', { roomId });
    setRoomId(null);
    setPlayerRole(null);
    setIsQuickMatch(false);
    setIsOnlineGame(false);
  };

  const handleSurrender = () => {
    playClickSound();
    if (!window.confirm('Surrender? This will end the game.')) {
      return;
    }

    if (mode === 'local') {
      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
    } else {
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
    let myPlayerIndex = 0;
    if (isOnlineGame) {
      myPlayerIndex = playerRole === 'host' ? 0 : 1;
    }

    if (currentPlayerIndex !== myPlayerIndex) return;
    if (selectedCardId === cardId) {
      setSelectedCardId(null);
    } else {
      setSelectedCardId(cardId);
    }
  };

  const handleColumnClick = (colIndex: number) => {
    if (phase !== 'playing') return;
    if (!selectedCardId) return;

    let myPlayerIndex = 0;
    if (isOnlineGame) {
      myPlayerIndex = playerRole === 'host' ? 0 : 1;
    }

    if (currentPlayerIndex !== myPlayerIndex) return;

    const action = {
      type: 'PLACE_AND_DRAW',
      payload: {
        cardId: selectedCardId,
        colIndex,
        isHidden: placeHidden,
      }
    };
    dispatch(action as any);

    if (isOnlineGame && roomId) {
      socket.emit('game_action', { roomId, action });
    }

    setSelectedCardId(null);
    setPlaceHidden(false);
  };

  return (
    <div className={`app ${isLobbyView ? 'view-lobby' : 'view-game'} phase-${phase}`}>
      <header className={`app-header ${(phase === 'playing' || phase === 'scoring') ? 'battle-mode' : ''}`}>
        <h1>XY Poker</h1>
        {showVersion && <span className="version">12081958</span>}
        {((mode === 'local' && phase === 'setup') || (mode === 'online' && !isOnlineGame)) && (
          <div className="mode-switch">
            <button
              className={mode === 'local' ? 'active' : ''}
              onClick={() => {
                playClickSound();
                setMode('local');
                setIsOnlineGame(false);
                setRoomId(null);
                setPlayerRole(null);
                dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
              }}
            >
              Local (vs AI)
            </button>
            <button
              className={mode === 'online' ? 'active' : ''}
              onClick={() => { playClickSound(); setMode('online'); }}
            >
              Online
            </button>
          </div>
        )}
      </header>

      {!showDiceAnimation && phase !== 'setup' && (
        <GameInfo
          gameState={gameState}
          isOnlineMode={mode === 'online'}
          playerRole={playerRole}
          playerName={playerName}
          opponentName={opponentName}
          onSurrender={handleSurrender}
        />
      )}

      {/* Main Content Area */}
      {!showDiceAnimation && (
        <>
          {mode === 'online' && isQuickMatch ? (
            <div className="setup-screen">
              <div className="waiting-message">
                <h3>🎲 Quick Match</h3>
                <h2>Waiting for opponent...</h2>
                <div className="loading-spinner"></div>
                <p>Your game will start automatically when an opponent joins</p>
                <button className="btn-cancel" onClick={handleCancelMatchmaking}>
                  Cancel
                </button>
              </div>
            </div>
          ) : isLobbyView ? (
            <Lobby
              onCreateRoom={handleCreateRoom}
              onJoinRoom={handleJoinRoom}
              onQuickMatch={handleQuickMatch}
              onCancelMatchmaking={handleCancelMatchmaking}
              roomId={roomId}
              isConnected={isConnected}
              playerRole={playerRole}
              playerName={playerName}
              onPlayerNameChange={setPlayerName}
              rating={myRating}
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
                      <div className="setup-actions" style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                        <button className="btn-primary" onClick={handleStartGame}>Start Game</button>
                        {mode === 'local' && (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: '0.9rem', padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.1)' }}
                            onClick={() => { playClickSound(); setShowRules(true); }}
                          >
                            📖 How to Play
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="waiting-message">
                        <h3>Waiting for Host to start game...</h3>
                        <div className="loading-spinner"></div>
                      </div>
                    )}

                    {/* Ad Banner for Local Mode Setup */}
                    {mode === 'local' && phase === 'setup' && (
                      <div className="ad-banner-container" style={{ position: 'absolute', bottom: '20px', width: '90%', left: '50%', transform: 'translateX(-50%)' }}>
                        <p style={{ color: '#666', fontSize: '0.8rem' }}>Ad Banner Space</p>
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
                      bottomPlayerId={(isOnlineGame && playerRole === 'guest') ? 'p2' : 'p1'}
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
                        isHidden={false}
                        isCurrentPlayer={currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0)}
                      />
                    </div>
                    {/* Only show action controls during my turn */}
                    {currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0) && (
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
                        </div>
                      </div>
                    )}
                  </>
                )}

                {phase === 'scoring' && (
                  <button className="btn-primary" onClick={() => dispatch({ type: 'CALCULATE_SCORE' })}>
                    Reveal & Calculate Scores
                  </button>
                )}

                {phase === 'ended' && !showResultsModal && (
                  <div className="end-game-controls" style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-primary" onClick={() => setShowResultsModal(true)}>
                      Show Results
                    </button>
                    <button className="btn-secondary" onClick={() => {
                      playClickSound();
                      setMode('online');
                      setRoomId(null);
                      setPlayerRole(null);
                      setIsOnlineGame(false);
                      setIsQuickMatch(false);
                      setRatingUpdates(null);
                      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
                    }}>
                      Back to Lobby
                    </button>
                  </div>
                )}

                {phase === 'ended' && showResultsModal && (
                  <GameResult
                    gameState={gameState}
                    onRestart={handleStartGame}
                    onClose={() => {
                      setShowResultsModal(false);
                      setMode('online');
                      setRoomId(null);
                      setPlayerRole(null);
                      setIsOnlineGame(false);
                      setIsQuickMatch(false);
                      setRatingUpdates(null);
                      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
                    }}
                    onViewBoard={() => {
                      setShowResultsModal(false);
                    }}
                    p1Name={p1DisplayName}
                    p2Name={p2DisplayName}
                    ratingUpdates={ratingUpdates}
                  />
                )}
              </footer>
            </>
          )}
        </>
      )}

      {showDiceAnimation && (
        <DiceRollOverlay
          targetValues={players[0].dice}
          onComplete={() => setShowDiceAnimation(false)}
        />
      )}
      {/* Rules Overlay */}
      {showRules && <RulesModal onClose={() => { playClickSound(); setShowRules(false); }} />}
    </div>
  );
}

export default App;
