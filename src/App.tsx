import { useReducer, useState, useEffect, useRef } from 'react';
import { gameReducer, INITIAL_GAME_STATE } from './logic/game';
import { evaluateYHand, evaluateXHand } from './logic/evaluation';
import { calculateXHandScores } from './logic/scoring';
import { recordGameResult } from './logic/aiLearning';
import type { Card, DiceSkin, CardSkin, BoardSkin } from './logic/types';
import { SharedBoard } from './components/SharedBoard';
import { Hand } from './components/Hand';
import { GameInfo } from './components/GameInfo';
import { GameResult } from './components/GameResult';
import { Lobby } from './components/Lobby';
import { SkinStore } from './components/SkinStore';
import ContactForm from './components/ContactForm';
// import { DevBadge } from './components/DevBadge';
import './App.css';

import { DiceRollOverlay } from './components/DiceRollOverlay';
import { RulesModal } from './components/RulesModal';
import { TurnTimer } from './components/TurnTimer';
import { AuthModal } from './components/AuthModal';
import { MyPage } from './components/MyPage'; // [NEW]
import { ShowdownPopup } from './components/ShowdownPopup'; // [NEW]
import type { PopupData } from './components/ShowdownPopup'; // [NEW]
import { updatePlayerStats, checkAchievements } from './logic/gamification'; // [NEW]
import { socket, connectSocket } from './logic/online';
import { supabase, fetchGlobalAiParameters, updateGlobalAiParameters } from './supabase';
import { getBestMove, getBestTurnOrder, DEFAULT_AI_PARAMS, setGlobalAiParams } from './logic/ai';
import { generateRandomPlayerName } from './logic/nameGenerator';
import { playClickSound, playSuccessSound, playCoinTossSound, speakText, warmupAudio, initSpeech, unlockAudioContext } from './utils/sound';
import { getBrowserId } from './utils/identity';

function App() {
  const [gameState, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const [phase, setPhase] = useState<'setup' | 'turn_selection' | 'playing' | 'scoring' | 'ended'>('setup');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [placeHidden, setPlaceHidden] = useState(false);
  const [showDiceAnimation, setShowDiceAnimation] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [isShaking, setIsShaking] = useState(false); // [Juice] Screen Shake

  // Rematch State
  const [rematchRequested, setRematchRequested] = useState(false);

  const [rematchInvited, setRematchInvited] = useState(false);
  const [showFinishAnimation, setShowFinishAnimation] = useState(false);

  // Coin Toss State
  const [isTossingCoin, setIsTossingCoin] = useState(false);
  const [tossResult, setTossResult] = useState<0 | 1 | null>(null);
  const [turnSelectionTimeLeft, setTurnSelectionTimeLeft] = useState<number | null>(null);
  const [turnAnnounce, setTurnAnnounce] = useState<{ firstName: string; secondName: string } | null>(null);

  // Online State
  const [mode, setMode] = useState<'local' | 'online'>('local');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerRole, setPlayerRole] = useState<'host' | 'guest' | null>(null);
  const [isOnlineGame, setIsOnlineGame] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [isQuickMatch, setIsQuickMatch] = useState(false);
  const [isRankedGame, setIsRankedGame] = useState(false); // Track if current game is ranked
  
  // Showdown Animation State
  const [revealedCols, setRevealedCols] = useState<number[]>([]);
  const [showXHand, setShowXHand] = useState(false);
  const [currentShowdownPopup, setCurrentShowdownPopup] = useState<PopupData | null>(null);

  // Rating State
  const [myRating, setMyRating] = useState<number | null>(null);
  const [ratingUpdates, setRatingUpdates] = useState<any>(null);
  const [isBotDisguise, setIsBotDisguise] = useState(false);
  const processedGameRef = useRef<string | null>(null); // Guard for scoring animation
  const gameStateRef = useRef(gameState); // Ref to access state in listeners

  // Keep Ref updated
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Audio Unlock for iOS PWA
  useEffect(() => {
    unlockAudioContext();
  }, []);

  // Supabase Session
  const [session, setSession] = useState<any>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true); // [NEW] Start as loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsSessionLoading(false); // [NEW] Session check done
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load Global Collaborative AI parameters on App Startup
  useEffect(() => {
    fetchGlobalAiParameters().then(params => {
      if (params) {
        setGlobalAiParams(params);
      }
    });
  }, []);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Turn Timer State
  const [timeLeft, setTimeLeft] = useState(60);
  const turnTimerRef = useRef<any>(null);

  // Player Names - Generate random name for uniqueness
  const [playerName, setPlayerName] = useState(() => {
    const saved = localStorage.getItem('xypoker_playerName_v2'); // Reset names by changing key
    return saved || generateRandomPlayerName();
  });
  const [opponentName, setOpponentName] = useState('Player 2');

  // Refs for accessing reliable state in event listeners
  const modeRef = useRef(mode);
  const roomIdRef = useRef(roomId);

  // SKIN STATE MANAGEMENT & EXPIRY
  const SKIN_EXPIRY_MS = 3 * 60 * 60 * 1000; // 3 hours
  const [showSkinStore, setShowSkinStore] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  // My Page State
  const [showMyPage, setShowMyPage] = useState(false);
  const [dbPlayerId, setDbPlayerId] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false); // [NEW] Premium Status
  const [isProfileLoaded, setIsProfileLoaded] = useState(false); // [NEW] Loading State

  useEffect(() => {
    // 0. Wait for session to initialize
    if (isSessionLoading) return;

    if (session?.user?.id) {
      supabase.from('players').select('id, is_premium, username').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (data) {
            setDbPlayerId(data.id);
            setIsPremium(!!data.is_premium);
            if (data.username) {
              setPlayerName(data.username);
              localStorage.setItem('xypoker_playerName_v2', data.username);
            }
          }
          setIsProfileLoaded(true);
        });
    } else {
      // Guest or not signed in
      setIsProfileLoaded(true);
    }
  }, [session, isSessionLoading]);

  const handleChooseTurnOrder = (startingPlayer: number) => {
    const action = { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer } };
    dispatch(action as any);
    if (isOnlineGame && roomId) {
      socket.emit('game_action', { roomId, action });
    }
  };

  useEffect(() => {
    // 1. Wait until profile is fully loaded
    if (!isProfileLoaded) return;

    // 2. If Premium, REMOVE script if it exists (Cleanup) and don't inject
    if (isPremium) {
      const existing = document.querySelector('script[data-zone="10326935"]');
      if (existing) {
        existing.remove();
        console.log('Developer (Premium) user detected: Removed existing ad script.');
      }
      return;
    }

    // 3. Inject Ad Script (Non-Developer)
    const existing = document.querySelector('script[data-zone="10326935"]');
    if (!existing) {
      const s = document.createElement('script');
      s.dataset.zone = '10326935';
      s.src = 'https://groleegni.net/vignette.min.js';
      document.body.appendChild(s);
    }
  }, [isPremium, isProfileLoaded]);

  // -- GENERIC SKIN LOADER HELPER --
  // We needed to duplicate this logic for Dice, Cards, Board to keep it clean and explicit
  // or refactor into a custom hook. For now, duplication is safer to implement quickly.

  // 1. DICE
  const [unlockedSkins, setUnlockedSkins] = useState<DiceSkin[]>(() => {
    return loadSkins<DiceSkin>('xypoker_unlockedSkins', 'xypoker_skinUnlockTimes', ['white']);
  });
  const [selectedSkin, setSelectedSkin] = useState<DiceSkin>(() => {
    return loadSelectedSkin<DiceSkin>('xypoker_selectedSkin', 'white', unlockedSkins);
  });

  // 2. CARDS
  const [unlockedCardSkins, setUnlockedCardSkins] = useState<CardSkin[]>(() => {
    return loadSkins<CardSkin>('xypoker_unlockedCardSkins', 'xypoker_cardUnlockTimes', ['classic']);
  });
  const [selectedCardSkin, setSelectedCardSkin] = useState<CardSkin>(() => {
    return loadSelectedSkin<CardSkin>('xypoker_selectedCardSkin', 'classic', unlockedCardSkins);
  });

  // 3. BOARDS
  const [unlockedBoardSkins, setUnlockedBoardSkins] = useState<BoardSkin[]>(() => {
    return loadSkins<BoardSkin>('xypoker_unlockedBoardSkins', 'xypoker_boardUnlockTimes', ['classic-green']);
  });
  const [selectedBoardSkin, setSelectedBoardSkin] = useState<BoardSkin>(() => {
    return loadSelectedSkin<BoardSkin>('xypoker_selectedBoardSkin', 'classic-green', unlockedBoardSkins);
  });

  // -- LOADERS --
  function loadSkins<T extends string>(storageKey: string, timeKey: string, defaults: T[]): T[] {
    const savedSkins = localStorage.getItem(storageKey);
    const savedTimes = localStorage.getItem(timeKey);

    const skins: T[] = savedSkins ? JSON.parse(savedSkins) : defaults;
    const times: Record<string, number> = savedTimes ? JSON.parse(savedTimes) : {};

    const now = Date.now();
    let hasChanges = false;
    const newSkins: T[] = [];
    const newTimes: Record<string, number> = { ...times };

    skins.forEach(skin => {
      // Defaults never expire
      if (defaults.includes(skin)) {
        newSkins.push(skin);
        return;
      }

      // Legacy migration: if unlocked but no time, set to NOW
      if (!newTimes[skin as string]) {
        newTimes[skin as string] = now;
        hasChanges = true;
      }

      // Check Expiry
      if (now - newTimes[skin as string] < SKIN_EXPIRY_MS) {
        newSkins.push(skin);
      } else {
        console.log(`Skin expired: ${skin}`);
        delete newTimes[skin as string];
        hasChanges = true;
      }
    });

    // Ensure defaults are always present (sanity check)
    defaults.forEach(def => {
      if (!newSkins.includes(def)) newSkins.push(def);
    });

    if (hasChanges) {
      localStorage.setItem(storageKey, JSON.stringify(newSkins));
      localStorage.setItem(timeKey, JSON.stringify(newTimes));
    }
    return newSkins;
  }

  function loadSelectedSkin<T extends string>(key: string, defaultSkin: T, unlockedList: T[]): T {
    const saved = localStorage.getItem(key) as T;
    if (saved && unlockedList.includes(saved)) {
      return saved;
    }
    return defaultSkin;
  }

  // -- UNLOCK HANDLERS --
  const handleUnlockSkin = (skinId: DiceSkin) => {
    unlockSkinGeneric<DiceSkin>(skinId, unlockedSkins, setUnlockedSkins, 'xypoker_unlockedSkins', 'xypoker_skinUnlockTimes', setSelectedSkin, 'xypoker_selectedSkin');
  };
  const handleUnlockCardSkin = (skinId: CardSkin) => {
    unlockSkinGeneric<CardSkin>(skinId, unlockedCardSkins, setUnlockedCardSkins, 'xypoker_unlockedCardSkins', 'xypoker_cardUnlockTimes', setSelectedCardSkin, 'xypoker_selectedCardSkin');
  };
  const handleUnlockBoardSkin = (skinId: BoardSkin) => {
    unlockSkinGeneric<BoardSkin>(skinId, unlockedBoardSkins, setUnlockedBoardSkins, 'xypoker_unlockedBoardSkins', 'xypoker_boardUnlockTimes', setSelectedBoardSkin, 'xypoker_selectedBoardSkin');
  };

  function unlockSkinGeneric<T extends string>(
    skinId: T,
    currentList: T[],
    setList: (l: T[]) => void,
    listKey: string,
    timeKey: string,
    setSelect: (s: T) => void,
    selectKey: string
  ) {
    const now = Date.now();
    const newUnlocked = Array.from(new Set([...currentList, skinId]));
    setList(newUnlocked);
    localStorage.setItem(listKey, JSON.stringify(newUnlocked));

    const loadedTimes = localStorage.getItem(timeKey);
    const currentTimes = loadedTimes ? JSON.parse(loadedTimes) : {};
    const newTimes = { ...currentTimes, [skinId]: now };
    localStorage.setItem(timeKey, JSON.stringify(newTimes));

    // Auto-select
    setSelect(skinId);
    localStorage.setItem(selectKey, skinId);
  }

  // -- SELECT HANDLERS --
  const handleSelectSkin = (skinId: DiceSkin) => { setSelectedSkin(skinId); localStorage.setItem('xypoker_selectedSkin', skinId); };
  const handleSelectCardSkin = (skinId: CardSkin) => { setSelectedCardSkin(skinId); localStorage.setItem('xypoker_selectedCardSkin', skinId); };
  const handleSelectBoardSkin = (skinId: BoardSkin) => { setSelectedBoardSkin(skinId); localStorage.setItem('xypoker_selectedBoardSkin', skinId); };

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
  const lastActionTimeRef = useRef<number>(0);
  const isAIActingRef = useRef<boolean>(false); // Guard against double AI moves

  useEffect(() => {
    // Clear timeout if quick match ends (game starts or cancelled)
    if (!isQuickMatch && quickMatchTimeoutRef.current) {
      clearTimeout(quickMatchTimeoutRef.current);
      quickMatchTimeoutRef.current = null;
    }
  }, [isQuickMatch]);


  // Initialize Socket
  useEffect(() => {
    connectSocket(session?.access_token);

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
      // Guard: Only accept sync if we are actually in a room
      if (!roomIdRef.current) return;

      dispatch({ type: 'SYNC_STATE', payload: remoteState } as any);
      // setIsOnlineGame(true); // Don't force this true here? Or maybe fine if we are in room.
      // Actually, if we are in lobby (roomId null), we returned above.
      // If we are in room, we are seemingly online.
      if (!isOnlineGame) setIsOnlineGame(true);
    });

    socket.on('request_sync', () => {
      // Host is authority.
      if (playerRoleRef.current === 'host' && roomIdRef.current) {
        console.log('Received sync request, broadcasting state');
        socket.emit('sync_state', {
          roomId: roomIdRef.current,
          state: gameStateRef.current
        });
      }
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
      setOpponentName(name);
      playSuccessSound();
    });

    socket.on('rematch_requested', ({ requesterName }) => {
      console.log('Rematch requested by:', requesterName);
      setRematchInvited(true);
      playSuccessSound();
    });

    socket.on('game_start', (data: any) => {
      const {
        roomId, initialDice, initialDeck, p1Name, p2Name, p1Id, p2Id,
        isRanked, p1IsPremium, p2IsPremium, startingPlayer
      } = data;

      setMode('online');
      setRoomId(roomId);
      setPhase('playing');
      setIsQuickMatch(false); // Clear quick match status
      setIsOnlineGame(true); // Confirm online game status
      setRematchRequested(false); // Clear any pending rematch requests
      setRematchInvited(false); // Clear any pending rematch invitations

      // Robustly set Role and Opponent Name from server authoritative data
      if (socket.id === p1Id) {
        setPlayerRole('host');
        setOpponentName(p2Name || 'Player 2');
        setPlayerName(p1Name); // Host is always p1
      } else if (socket.id === p2Id) {
        setPlayerRole('guest');
        setOpponentName(p1Name || 'Player 1');
        setPlayerName(p2Name); // Guest is always p2
      }

      setIsRankedGame(!!isRanked); // Update Ranked Flag

      // Dispatch START_GAME with synced state
      dispatch({
        type: 'START_GAME',
        payload: {
          initialDice,
          initialDeck,
          startingPlayer,
          playerConfig: {
            p1: { id: p1Id, isDeveloper: !!p1IsPremium }, // Map premium to developer
            p2: { id: p2Id, isDeveloper: !!p2IsPremium }
          }
        }
      });

      console.log(`Game started in room ${roomId} (Ranked: ${isRanked}). Starting: ${startingPlayer}`);
      playSuccessSound();
      setShowDiceAnimation(true); // Show dice animation for everyone
      setShowResultsModal(false); // Ensure results modal is hidden
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
        setPhase('setup'); // [FIX] Reset phase to setup

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
      setPhase('setup'); // [FIX] Reset phase to setup
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
      socket.off('request_sync');
      socket.off('auto_start_game');
      socket.off('opponent_joined');
      socket.off('game_action');
      socket.off('game_end_surrender');
      socket.off('player_left');
      // Don't disconnect on cleanup - only when component unmounts
    };
  }, []); // Empty dependency array - only run once on mount

  // Re-authenticate socket when session changes
  useEffect(() => {
    if (session?.access_token) {
      if (socket.connected) {
        socket.auth = { token: session.access_token };
        socket.disconnect().connect();
      } else {
        connectSocket(session.access_token);
      }
    }
  }, [session?.access_token]);

  // Fetch rating on connect
  // (Moved to combined effect above to include session dependency)
  /*
  useEffect(() => {
    if (isConnected) {
      const id = getBrowserId(); // Use utility to get or create
      socket.emit('get_player_data', { browserId: id });
    }
  }, [isConnected]);
  */

  // Sync State on Change (Host only)
  useEffect(() => {
    if (isOnlineGame && playerRole === 'host' && roomId) {
      socket.emit('sync_state', { roomId, state: gameState });
    }
  }, [gameState, isOnlineGame, playerRole, roomId]);

  // Rating: Handle Game End Report (Host only)
  useEffect(() => {
    // Only report for RANKED games
    if (isOnlineGame && isRankedGame && playerRole === 'host' && roomId && gameState.phase === 'ended' && gameState.winner !== null) {
      socket.emit('report_game_end', {
        roomId,
        winner: gameState.winner,
        p1Score: gameState.players[0].score,
        p2Score: gameState.players[1].score
      });
    }
  }, [gameState.phase, gameState.winner, isOnlineGame, playerRole, roomId]);

  const { currentPlayerIndex, players } = gameState;
  const currentPlayer = players[currentPlayerIndex];

  // Auto-Finish Logic
  useEffect(() => {
    if (phase === 'scoring') {
      // 1. Show Finish Animation
      setShowFinishAnimation(true);
      playSuccessSound(); // Use success sound for "Finish!"

      // Juice: Screen Shake on Showdown
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);

      // 2. Wait 2 seconds, then Calculate
      const timer = setTimeout(() => {
        setShowFinishAnimation(false);
        // Dispatch calculate (locally for both players, as they both reach this phase)
        dispatch({ type: 'CALCULATE_SCORE' });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Turn Selection Logic
  useEffect(() => {
    let timer1: ReturnType<typeof setTimeout>;
    let timer2: ReturnType<typeof setTimeout>;

    if (phase === 'turn_selection') {
      if (showDiceAnimation) {
        setIsTossingCoin(false);
        setTossResult(null);
      } else {
        timer1 = setTimeout(() => {
          setIsTossingCoin(true);
          playCoinTossSound();
          setTossResult(currentPlayerIndex as 0 | 1); // 0 (Host/P1) or 1 (Guest/P2/AI)

          timer2 = setTimeout(() => {
            setIsTossingCoin(false);
          }, 3000); // 3 seconds animation
        }, 1500); // 1.5s pause to see hand
      }
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [phase, showDiceAnimation, currentPlayerIndex]);

  // AI Turn Selection Logic (When AI wins the toss)
  useEffect(() => {
    if (phase === 'turn_selection' && !isTossingCoin && tossResult !== null && !isOnlineGame && currentPlayerIndex === 1) {
      // AI won the toss! Evaluate hand strength to choose First or Second
      const shouldGoFirst = getBestTurnOrder(gameState, 1, DEFAULT_AI_PARAMS);

      const timer = setTimeout(() => {
        const chosenStartingPlayer = shouldGoFirst ? 1 : 0;
        handleChooseTurnOrder(chosenStartingPlayer);
      }, 1500); // Small delay for human to see AI is "thinking"

      return () => clearTimeout(timer); // ← クリーンアップ: 二重発火を防ぐ
    }
  }, [phase, isTossingCoin, tossResult, currentPlayerIndex, isOnlineGame]); // gameState を依存配列から除去

  // Turn Selection Timer Logic (Human)
  useEffect(() => {
    if (phase === 'turn_selection' && !isTossingCoin) {
      const isMyChoice = ((mode === 'local' && tossResult === 0) || (mode === 'online' && ((playerRole === 'host' && tossResult === 0) || (playerRole === 'guest' && tossResult === 1))));
      
      if (isMyChoice && turnSelectionTimeLeft === null) {
        setTurnSelectionTimeLeft(10);
      }
    } else {
      setTurnSelectionTimeLeft(null);
    }
  }, [phase, isTossingCoin, tossResult, mode, playerRole, turnSelectionTimeLeft]);

  // Turn Selection Timer Tick
  useEffect(() => {
    if (turnSelectionTimeLeft !== null && turnSelectionTimeLeft > 0) {
      const timer = setTimeout(() => {
        setTurnSelectionTimeLeft(turnSelectionTimeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (turnSelectionTimeLeft === 0) {
      // Auto-choose randomly
      const randomChoice = Math.random() > 0.5;
      const myIndex = mode === 'online' && playerRole === 'guest' ? 1 : 0;
      const opIndex = mode === 'online' && playerRole === 'guest' ? 0 : 1;
      const chosenIndex = randomChoice ? myIndex : opIndex;
      handleChooseTurnOrder(chosenIndex);
      setTurnSelectionTimeLeft(null);
    }
  }, [turnSelectionTimeLeft, mode, playerRole]);

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

  // Sync local phase with game winner/turn
  const prevPhaseRef = useRef<string>('');
  useEffect(() => {
    if (gameState.winner) {
      setPhase('ended');
    } else if (gameState.phase === 'turn_selection') {
      setPhase('turn_selection');
    } else if (gameState.phase === 'scoring') {
      setPhase('scoring');
    } else if (gameState.turnCount > 0 || gameState.phase === 'playing') {
      if (prevPhaseRef.current !== 'playing') {
        // Show turn announce banner when game first starts
        const firstIdx = gameState.currentPlayerIndex;
        const first = firstIdx === 0 ? p1DisplayName : p2DisplayName;
        const second = firstIdx === 0 ? p2DisplayName : p1DisplayName;
        setTurnAnnounce({ firstName: first, secondName: second });
        setTimeout(() => setTurnAnnounce(null), 3000);
      }
      setPhase('playing');
    }
    prevPhaseRef.current = gameState.phase;
  }, [gameState]);

  // AI Turn Logic
  useEffect(() => {
    if (turnAnnounce !== null) return; // Wait until lead/follow banner announcement completes

    if (mode === 'local' && phase === 'playing' && currentPlayerIndex === 1 && !showDiceAnimation) {
      if (isAIActingRef.current) return; // すでにAIが動作中なら何もしない
      isAIActingRef.current = true;

      const delay = isBotDisguise ? (2000 + Math.random() * 3000) : 1000;

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
        isAIActingRef.current = false; // アクション完了後にフラグをリセット
      }, delay);

      return () => {
        clearTimeout(timer);
        isAIActingRef.current = false;
      };
    }
  }, [gameState, mode, isBotDisguise, phase, showDiceAnimation, turnAnnounce]);

  // User Auto-Play Logic (Both Local P1 and Online Self)
  useEffect(() => {
    if (turnAnnounce !== null) return; // Wait until lead/follow banner announcement completes

    // Check if Auto is ON, game is playing, and it's MY turn
    const isMyTurn = (mode === 'local' && currentPlayerIndex === 0) ||
      (isOnlineGame && playerRole === 'host' && currentPlayerIndex === 0) ||
      (isOnlineGame && playerRole === 'guest' && currentPlayerIndex === 1);

    if (isAutoPlay && phase === 'playing' && isMyTurn && !showDiceAnimation) {
      const delay = 800; // Slightly faster than bot? Or standard.

      const timer = setTimeout(() => {
        // Use AI to find best move for ME
        const myIndex = currentPlayerIndex;
        const move = getBestMove(gameState, myIndex);

        const action = {
          type: 'PLACE_AND_DRAW',
          payload: {
            cardId: move.cardId,
            colIndex: move.colIndex,
            isHidden: move.isHidden
          }
        };

        playClickSound(); // Feedback
        dispatch(action as any);

        if (isOnlineGame && roomId) {
          socket.emit('game_action', { roomId, action });
        }
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [isAutoPlay, phase, currentPlayerIndex, mode, isOnlineGame, playerRole, roomId, gameState, showDiceAnimation, turnAnnounce]);

  // Showdown sequence runner (Re-usable for Replay Showdown)
  const triggerShowdownSequence = async () => {
    setRevealedCols([]);
    setShowXHand(false);
    setCurrentShowdownPopup(null);
    setShowResultsModal(false);

    const { players } = gameState;
    const p1 = players[0];
    const p2 = players[1];
    const dice = p1.dice; // Shared dice values

    // Helper to map type ID to readable string
    const getReadableHandName = (typeId: string): string => {
      return typeId.replace(/([A-Z])/g, ' $1').trim().replace(/ Of /g, ' of ').replace(/ A /g, ' a ');
    };

    // 出目の低い順（画面右→左）で表示。同じ値の場合は右の列（高いインデックス）を優先
    const orderedColIndices = [0, 1, 2, 3, 4].sort((a, b) => {
      const diceDiff = dice[a] - dice[b];
      return diceDiff !== 0 ? diceDiff : b - a; // 同値なら右の列（高インデックス）を先に
    });

    // Pre-evaluate all columns 0-4
    const colResults = Array.from({ length: 5 }, (_, colIndex) => {
      const p1Cards = [p1.board[0][colIndex]!, p1.board[1][colIndex]!, p1.board[2][colIndex]!];
      const p2Cards = [p2.board[0][colIndex]!, p2.board[1][colIndex]!, p2.board[2][colIndex]!];

      const p1Res = evaluateYHand(p1Cards, dice[colIndex]);
      const p2Res = evaluateYHand(p2Cards, dice[colIndex]);

      if (p1Res.rankValue > p2Res.rankValue) return { winner: 'p1' as const, type: p1Res.type, cards: p1Cards };
      if (p2Res.rankValue > p1Res.rankValue) return { winner: 'p2' as const, type: p2Res.type, cards: p2Cards };

      for (let k = 0; k < Math.max(p1Res.kickers.length, p2Res.kickers.length); k++) {
        const k1 = p1Res.kickers[k] || 0;
        const k2 = p2Res.kickers[k] || 0;
        if (k1 > k2) return { winner: 'p1' as const, type: p1Res.type, cards: p1Cards };
        if (k2 > k1) return { winner: 'p2' as const, type: p2Res.type, cards: p2Cards };
      }
      return { winner: 'draw' as const, type: null, cards: [] };
    });

    // Row Result (X-Hand)
    const p1XRes = evaluateXHand(p1.board[2] as Card[]);
    const p2XRes = evaluateXHand(p2.board[2] as Card[]);
    const { p1Score: p1X, p2Score: p2X } = calculateXHandScores(p1XRes, p2XRes);
    let rowResult: { winner: 'p1' | 'p2' | 'draw'; type: string | null; cards: Card[] } = { winner: 'draw', type: null, cards: [] };
    if (p1X > p2X) rowResult = { winner: 'p1', type: p1XRes.type, cards: p1.board[2] as Card[] };
    else if (p2X > p1X) rowResult = { winner: 'p2', type: p2XRes.type, cards: p2.board[2] as Card[] };

    for (let currentStep = 0; currentStep <= 5; currentStep++) {
      playClickSound();

      if (currentStep <= 4) {
        const currentCol = orderedColIndices[currentStep];
        setRevealedCols(prev => [...prev, currentCol]);
        
        const res = colResults[currentCol];
        setCurrentShowdownPopup({
          id: `col-${currentStep}-${Date.now()}`,
          text: res.type ? getReadableHandName(res.type) : 'DRAW',
          winner: res.winner,
          diceValue: dice[currentCol],
          isXHand: false,
          cards: res.cards
        });

        if (res.winner !== 'draw' && res.type) {
          await Promise.all([
            speakText(getReadableHandName(res.type)),
            new Promise(r => setTimeout(r, 2200)) // Wait at least 2200ms for visual animation
          ]);
        } else {
          await new Promise(r => setTimeout(r, 2200));
        }
      } else if (currentStep === 5) {
        setShowXHand(true);
        
        setCurrentShowdownPopup({
          id: `row-${currentStep}-${Date.now()}`,
          text: rowResult.type ? getReadableHandName(rowResult.type) : 'DRAW',
          winner: rowResult.winner,
          isXHand: true,
          cards: rowResult.cards
        });

        if (rowResult.winner !== 'draw' && rowResult.type) {
          await Promise.all([
            speakText(getReadableHandName(rowResult.type)),
            new Promise(r => setTimeout(r, 2200))
          ]);
        } else {
          await new Promise(r => setTimeout(r, 2200));
        }
      }
      
      // Small buffer between steps
      await new Promise(r => setTimeout(r, 100));
    }

    // Finished
    setTimeout(() => {
      setCurrentShowdownPopup(null); // Hide popup before showing modal
      setShowResultsModal(true);
    }, 2500); // Extended to match 2.8s sustain
  };

  useEffect(() => {
    if (phase === 'ended') {
      const gameSignature = `${roomId}-${gameState.winner}-${gameState.turnCount}`;
      if (processedGameRef.current === gameSignature) {
        return;
      }
      processedGameRef.current = gameSignature;

      triggerShowdownSequence();

      if (mode === 'local') {
        const { winner } = gameState;
        const aiWon = winner === 'p2';
        const isDraw = winner === null;
        recordGameResult(aiWon, isDraw);

        // Contribute game outcome to the global collaborative AI parameters
        if (opponentName === 'AI') {
          updateGlobalAiParameters(aiWon, isDraw);
        }

        // Update Gamification Stats (Only if logged in and I am Player 1 against AI)
        if (dbPlayerId) {
          // Calculate Score locally
          const p1 = gameState.players[0];
          const p2 = gameState.players[1];
          // Determine if p1 has board[2] filled?
          // At 'ended' phase, yes.
          const p1XRes = evaluateXHand(p1.board[2] as Card[]);
          const p2XRes = evaluateXHand(p2.board[2] as Card[]);
          const { p1Score } = calculateXHandScores(p1XRes, p2XRes);

          const myScore = p1Score;
          let resultStr: 'win' | 'loss' | 'draw' = 'draw';
          if (!aiWon && !isDraw) resultStr = 'win';
          else if (aiWon) resultStr = 'loss';

          updatePlayerStats(dbPlayerId, resultStr, myScore).then(res => {
            if (res?.leveledUp) {
              // Level Up Alert
              alert(`Level Up! You are now Level ${res.newLevel}`);
            }
            if (res?.coinsEarned && res.coinsEarned > 0) {
              // Optional: Show coin toast
            }
          });
          checkAchievements(dbPlayerId, gameState, resultStr);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode]);

  useEffect(() => {
    localStorage.setItem('xypoker_playerName_v2', playerName);
  }, [playerName]);

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch data when connection or session changes
  useEffect(() => {
    if (isConnected) {
      const id = getBrowserId(); // Use utility to get or create
      const userId = session?.user?.id;
      // Re-fetch player data when session maps
      socket.emit('get_player_data', { browserId: id, userId });
    }
  }, [isConnected, session]); // Trigger on session change too

  useEffect(() => {
    if (mode === 'local') {
      if (!isBotDisguise) {
        setOpponentName('AI');
      }
    } else if (mode === 'online' && !isOnlineGame) {
      setOpponentName('Player 2');
    }
  }, [mode, isOnlineGame, isBotDisguise]);

  // Turn Timer Logic
  useEffect(() => {
    if (phase !== 'playing' || showDiceAnimation) return;

    // Reset timer on turn change
    setTimeLeft(60);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoPlay();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    turnTimerRef.current = timer;

    return () => clearInterval(timer);
  }, [currentPlayerIndex, phase, showDiceAnimation]); // Reset when turn changes

  const handleAutoPlay = () => {
    if (phase !== 'playing') return;

    // Check if it's "MY" turn to act.
    // In Local: App handles both.
    // In Online: Only handle if it is MY turn.

    let myPlayerIndex = 0;
    if (isOnlineGame) {
      myPlayerIndex = playerRole === 'host' ? 0 : 1;
    }

    // Safety: If online and not my turn, DO NOT auto-play for opponent (they handle their own)
    if (isOnlineGame && currentPlayerIndex !== myPlayerIndex) {
      console.log("Timer expired for opponent - waiting for their move...");
      return;
    }

    console.log("Timer expired - Auto-playing random move");

    const currentPlayer = gameState.players[currentPlayerIndex];
    if (currentPlayer.hand.length === 0) return; // Should not happen in playing phase

    // Pick random card
    const randomCardIndex = Math.floor(Math.random() * currentPlayer.hand.length);
    const card = currentPlayer.hand[randomCardIndex];

    // Find valid columns
    const validCols = [];
    for (let c = 0; c < 5; c++) {
      if (!currentPlayer.board[0][c] || !currentPlayer.board[1][c] || !currentPlayer.board[2][c]) {
        // Check specific row availability is complex with current structure?
        // Actually board is [row][col].
        // Logic: We place in column. Game logic finds first empty row from bottom (2->0) or top?
        // Game logic `placeCard(player, card, colIndex)` handles row placement.
        // We just need to check if column is full.
        if (!currentPlayer.board[0][c]) { // If top row is empty, column has space
          validCols.push(c);
        }
      }
    }

    if (validCols.length === 0) return; // Board full?

    const randomCol = validCols[Math.floor(Math.random() * validCols.length)];

    const action = {
      type: 'PLACE_AND_DRAW',
      payload: {
        cardId: card.id,
        colIndex: randomCol,
        isHidden: false // Random placement is public
      }
    };

    dispatch(action as any);
    playClickSound();

    if (isOnlineGame && roomId) {
      socket.emit('game_action', { roomId, action });
    }
  };

  const handleStartGame = () => {
    playClickSound();
    warmupAudio(); // Resume AudioContext
    initSpeech();  // Unlock SpeechSynthesis

    // Explicitly reset disguise for manual local starts (e.g. from Setup screen)
    if (mode === 'local') {
      setIsBotDisguise(false);
      setOpponentName('AI');

      // Fetch latest global AI parameters for collaborative learning
      fetchGlobalAiParameters().then(params => {
        if (params) {
          setGlobalAiParams(params);
        }
      });
    }

    dispatch({ type: 'START_GAME' });
    setShowDiceAnimation(true);
    setShowResultsModal(false);
    processedGameRef.current = null; // Reset animation trigger
    setRevealedCols([]);
    setShowXHand(false);
    setCurrentShowdownPopup(null);
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

    // Disguise as Human
    setOpponentName(generateRandomPlayerName());
    setIsBotDisguise(true);

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
    const userId = session?.user?.id;
    socket.emit('create_room', { playerName, browserId, userId }, (response: any) => {
      setRoomId(response.roomId);
      setPlayerRole('host');
    });
  };
  const handleJoinRoom = (id: string) => {
    const browserId = getBrowserId();
    const userId = session?.user?.id;
    socket.emit('join_room', { roomId: id, playerName, browserId, userId }, (response: any) => {
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

  const handleRestart = () => {
    if (isOnlineGame) {
      if (isQuickMatch) {
        // Quick Match -> Find New
        // 1. Leave current room (socket event)
        if (roomId) {
          socket.emit('leave_room', { roomId });
        }
        // 2. Reset State but keep "Online" mode references if needed,
        // actually handleQuickMatch sets up mostly everything.
        // But let's clear the current game state first to be safe.
        setRoomId(null);
        setPlayerRole(null);
        setPhase('setup');
        setIsOnlineGame(false); // Temporarily false until match found

        // 3. Start Search
        setTimeout(() => {
          handleQuickMatch();
        }, 100);
      } else {
        // Room Match -> Request Rematch
        if (!rematchRequested) {
          socket.emit('request_rematch', { roomId });
          setRematchRequested(true);
        }
      }
    } else {
      // Offline -> Instant Restart
      handleStartGame();
    }
  };

  const handleQuickMatch = () => {
    setIsQuickMatch(true);

    // Start 15s Timer
    if (quickMatchTimeoutRef.current) clearTimeout(quickMatchTimeoutRef.current);
    quickMatchTimeoutRef.current = setTimeout(() => {
      startBotMatch();
    }, 15000);

    const browserId = getBrowserId();
    const userId = session?.user?.id;
    socket.emit('quick_match', { playerName, browserId, userId }, (response: any) => {
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

  const returnToLobby = () => {
    playClickSound();
    if (roomId) {
      socket.emit('leave_room', { roomId });
    }
    setMode('online');
    setRoomId(null);
    setPlayerRole(null);
    setIsOnlineGame(false);
    setIsQuickMatch(false);
    setRatingUpdates(null);
    setPhase('setup');
    dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
  };

  const handleCancelMatchmaking = () => {
    playClickSound();
    if (quickMatchTimeoutRef.current) {
      clearTimeout(quickMatchTimeoutRef.current);
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

  const handleSurrender = () => {
    playClickSound();
    if (!window.confirm('Surrender? This will end the game.')) {
      return;
    }

    if (mode === 'local') {
      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
      setPhase('setup');
    } else {
      socket.emit('surrender', { roomId });
    }
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
    // Determine if it is valid to click
    const now = Date.now();
    if (now - lastActionTimeRef.current < 400) return; // Prevent double click multi-placements

    // Resume Audio on interaction just in case
    warmupAudio();
    initSpeech();

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

    lastActionTimeRef.current = Date.now();
    setSelectedCardId(null);
    setPlaceHidden(false);
  };

  // Fullscreen Logic
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      // Check standard and vendor-prefixed properties
      const isFs = !!(document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement);
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      const doc = document.documentElement as any;
      const currentFs = document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;

      if (!currentFs) {
        if (doc.requestFullscreen) {
          await doc.requestFullscreen();
        } else if (doc.webkitRequestFullscreen) {
          await doc.webkitRequestFullscreen();
        } else if (doc.mozRequestFullScreen) {
          await doc.mozRequestFullScreen();
        } else if (doc.msRequestFullscreen) {
          await doc.msRequestFullscreen();
        } else {
          // Fallback for iOS Safari which usually doesn't support DOM fullscreen API
          alert("Fullscreen API not supported on this device/browser.\nTry 'Add to Home Screen' for fullscreen experience.");
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      console.error("Error toggling fullscreen:", err);
      // alert("Error entering fullscreen: " + err); // Optional debug
    }
  };

  return (
    <div className={`app ${isLobbyView ? 'view-lobby' : 'view-game'} phase-${phase} ${isShaking ? 'shake-intense' : ''} ${phase === 'scoring' ? 'showdown-active' : ''}`}>

      {/* 先攻・後攻 アナウンスオーバーレイ */}
      {turnAnnounce && (
        <div className="turn-announce-overlay">
          <div className="turn-announce-content">
            <div className="turn-announce-row first">
              <span className="turn-announce-badge first-badge">先攻</span>
              <span className="turn-announce-name">{turnAnnounce.firstName}</span>
            </div>
            <div className="turn-announce-divider">VS</div>
            <div className="turn-announce-row second">
              <span className="turn-announce-badge second-badge">後攻</span>
              <span className="turn-announce-name">{turnAnnounce.secondName}</span>
            </div>
          </div>
        </div>
      )}
      <header className={`app-header ${(phase === 'playing' || phase === 'scoring') ? 'battle-mode' : ''}`}>
        <div className="header-title-row">
          <h1>XY Poker</h1>
          {showVersion && <span className="version">v06301356</span>}
        </div>

        <button
          className="btn-fullscreen"
          onClick={toggleFullscreen}
          aria-label="Toggle Fullscreen"
        >
          {isFullscreen ? '⊠' : '⛶'}
        </button>

        {/* Auth Button (Top Right) */}
        {!isOnlineGame && phase !== 'playing' && (
          <div className="auth-status" style={{ position: 'absolute', top: 10, right: 10, zIndex: 50 }}>
            {session ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1.2' }}>
                  <span style={{ fontSize: '0.8rem', color: '#fff' }}>{session.user.email}</span>
                  <span style={{ fontSize: '0.6rem', color: '#aaa' }}>ID: {session.user.id.slice(0, 8)}</span>
                </div>
                <button
                  onClick={() => setShowMyPage(true)}
                  style={{ padding: '4px 8px', fontSize: '0.7rem', background: '#4da8da', border: 'none', color: '#000', borderRadius: '4px', cursor: 'pointer', marginLeft: '10px', fontWeight: 'bold' }}
                >
                  My Page
                </button>
              </div>
            ) : (
              <button
                className="btn-auth"
                onClick={() => setShowAuthModal(true)}
              >
                Sign In / Sign Up
              </button>
            )}
          </div>
        )}

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
                setIsBotDisguise(false); // Reset disguise for explicit local mode
                setOpponentName('AI');   // Explicit AI name
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
          isPremium={isPremium}
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
              onShowRules={() => { playClickSound(); setShowRules(true); }}
              onShowMyPage={() => { playClickSound(); setShowMyPage(true); }}
            />
          ) : (
            <>
              {/* Auth Modal */}


              {/* Turn Timer Conditionally Rendered - ONLY during playing */}
              {(phase === 'playing') && (
                <div className="game-status-bar">
                  <TurnTimer
                    timeLeft={timeLeft}
                    totalTime={15}
                    currentPlayerIndex={currentPlayerIndex}
                    isMyTurn={
                      (isOnlineGame && playerRole === 'host' && currentPlayerIndex === 0) ||
                      (isOnlineGame && playerRole === 'guest' && currentPlayerIndex === 1) ||
                      (mode === 'local' && currentPlayerIndex === 0)
                    }
                    onResync={() => {
                      if (isOnlineGame && roomIdRef.current) {
                        playClickSound();
                        socket.emit('request_sync', { roomId: roomIdRef.current });
                      }
                    }}
                  />
                </div>
              )}
              <main className="game-board">
                {phase === 'setup' && (
                  <div className="setup-screen">
                    {isQuickMatch ? (
                      <div className="waiting-message">
                        <h3>🎲 Quick Match</h3>
                        <h2>Waiting for opponent...</h2>
                        <div className="loading-spinner"></div>
                        <p>Your game will start automatically when an opponent joins</p>
                        <button className="btn-cancel" onClick={handleCancelMatchmaking}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="logo-area">
                          <h1>XY Poker</h1>
                          <p>Strategic Card & Dice Battle</p>
                        </div>
                        <div className="setup-actions">
                          <button className="btn-primary" onClick={() => {
                            setIsAutoPlay(false); // Ensure Auto is OFF when manually starting
                            handleStartGame();
                          }}>
                            Start Game
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ marginTop: '1rem', padding: '8px 16px', fontSize: '0.9rem' }}
                            onClick={() => { playClickSound(); setShowSkinStore(true); }}
                          >
                            🎨 Skin Shop
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ marginTop: '1rem', marginLeft: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
                            onClick={() => { playClickSound(); setShowRules(true); }}
                          >
                            📖 Rules
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ marginTop: '1rem', marginLeft: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
                            onClick={() => { playClickSound(); setShowContactModal(true); }}
                          >
                            📬 Report
                          </button>
                        </div>
                        <div className="beta-disclaimer" style={{
                          marginTop: '2rem',
                          padding: '12px',
                          border: '1px solid rgba(255, 204, 0, 0.3)',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(255, 204, 0, 0.05)',
                          color: '#ccc',
                          fontSize: '0.85rem',
                          maxWidth: '400px',
                          textAlign: 'center',
                          lineHeight: '1.4'
                        }}>
                          <strong style={{ color: '#ffcc00', display: 'block', marginBottom: '4px' }}>⚠️ Development Build</strong>
                          This game is currently in active development.<br />
                          Please note that data loss or critical bugs may occur.<br />
                          We recommend playing in <strong>fullscreen mode</strong> for the best experience.<br />
                          If you encounter any issues, please let us know via the <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setShowContactModal(true)}>Report form</span>.
                        </div>
                      </>
                    )}
                  </div>
                )}
                {phase === 'turn_selection' && (isTossingCoin || tossResult !== null) && (
                  <div className="turn-selection-overlay">
                    <h2 style={{ marginBottom: '20px' }}>Coin Toss</h2>
                    {isTossingCoin ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div className="coin-container">
                          <div className={`coin flipping winner-${tossResult ?? 0}`}>
                            <div className="coin-front" />
                            <div className="coin-back" />
                          </div>
                        </div>
                        <h2 style={{ marginTop: '20px' }}>Spinning Coin...</h2>
                      </div>
                    ) : (
                      <div className="coin-container">
                        <div className={`coin flipped winner-${tossResult ?? 0}`}>
                          <div className="coin-front" />
                          <div className="coin-back" />
                        </div>
                      </div>
                    )}

                    {!isTossingCoin && tossResult !== null && (
                      <div className="toss-result-area">
                        <div className="toss-winner-text" style={{ color: tossResult === 0 ? '#4facfe' : '#ff0844' }}>
                          {tossResult === 0 ? (mode === 'online' && playerRole === 'guest' ? opponentName : playerName) : (mode === 'online' && playerRole === 'guest' ? playerName : opponentName)} won the toss!
                        </div>
                        
                        {/* If it's my turn to choose (I won the toss) */}
                        {((mode === 'local' && tossResult === 0) || (mode === 'online' && ((playerRole === 'host' && tossResult === 0) || (playerRole === 'guest' && tossResult === 1)))) ? (
                          <div className="turn-choice-container" style={{ textAlign: 'center' }}>
                            {turnSelectionTimeLeft !== null && (
                              <div style={{ color: '#ffcc00', marginBottom: '10px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                                残り時間: {turnSelectionTimeLeft}秒
                              </div>
                            )}
                            <div className="turn-choice-buttons">
                              <button onClick={() => {
                                playClickSound();
                                const myIndex = mode === 'online' && playerRole === 'guest' ? 1 : 0;
                                handleChooseTurnOrder(myIndex);
                              }}>
                                First (先攻)
                              </button>
                              <button onClick={() => {
                                playClickSound();
                                const opIndex = mode === 'online' && playerRole === 'guest' ? 0 : 1;
                                handleChooseTurnOrder(opIndex);
                              }}>
                                Second (後攻)
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="waiting-turn-text">
                            Waiting for opponent to choose...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {(phase === 'turn_selection' || phase === 'playing' || phase === 'scoring' || phase === 'ended') && (
                  <div className="play-area">


                    <SharedBoard
                      playerBoard={players[isOnlineGame && playerRole === 'guest' ? 1 : 0].board}
                      opponentBoard={players[isOnlineGame && playerRole === 'guest' ? 0 : 1].board}
                      dice={players[currentPlayerIndex].dice}
                      onColumnClick={handleColumnClick}
                      isCurrentPlayer={currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0)}
                      revealAll={phase === 'ended'}
                      winningColumns={phase === 'ended' ? calculateWinningColumns() : undefined}
                      xWinner={phase === 'ended' ? calculateXWinner() : undefined}
                      bottomPlayerId={isOnlineGame && playerRole === 'guest' ? 'p2' : 'p1'}
                      selectedSkin={selectedSkin}
                      selectedCardSkin={selectedCardSkin}
                      selectedBoardSkin={selectedBoardSkin}
                      revealedCols={revealedCols}
                      showXHand={showXHand}
                    />
                  </div>
                )}
              </main>

              {phase !== 'setup' && (
                <footer className="controls">

                  {(phase === 'playing' || phase === 'turn_selection') && (
                    <>
                      <div className="hand-container">
                        <Hand
                          hand={players[isOnlineGame && playerRole === 'guest' ? 1 : 0].hand}
                          selectedCardId={selectedCardId}
                          onCardSelect={phase === 'playing' ? handleCardSelect : () => {}} // Disable selection in turn_selection
                          isHidden={false}
                          isCurrentPlayer={phase === 'playing' ? (currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0)) : false}
                        />
                      </div>
                      {/* Only show action controls during my turn in playing phase */}
                      {phase === 'playing' && currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0) && (
                        <div className="action-bar">
                          <div className="place-controls">
                            <div className="toggle-hidden">
                              <input
                                type="checkbox"
                                checked={placeHidden}
                                onChange={(e) => setPlaceHidden(e.target.checked)}
                                disabled={!selectedCardId || currentPlayer.hiddenCardsCount >= 3}
                                style={{ margin: 0, padding: 0 }}
                              />
                              <span style={{}}>Face Down ({3 - currentPlayer.hiddenCardsCount} left)</span>
                            </div>
                          </div>
                        </div>

                      )}

                      {/* Check if it is valid for ME to see controls (My turn or Auto is on?) */}
                      {/* Actually, show Auto toggle always? Or only during my turn? */}
                      {/* Better always visible in footer if playing */}
                      {isPremium && (
                        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                          <button
                            className={`btn-secondary ${isAutoPlay ? 'active-auto' : ''}`}
                            style={{
                              padding: '5px 10px',
                              fontSize: '0.8rem',
                              background: isAutoPlay ? '#e91e63' : '#666',
                              color: 'white',
                              border: isAutoPlay ? '2px solid white' : 'none'
                            }}
                            onClick={() => {
                              playClickSound();
                              setIsAutoPlay(!isAutoPlay);
                            }}
                          >
                            <span style={{ marginLeft: '4px' }}>Auto: {isAutoPlay ? 'ON' : 'OFF'}</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {phase === 'scoring' && (
                    <div className="status-message">
                      Calculating Scores...
                    </div>
                  )}

                  {phase === 'ended' && !showResultsModal && (
                    <div className="end-game-controls" style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-secondary" onClick={() => {
                        playClickSound();
                        triggerShowdownSequence();
                      }}>
                        Replay Showdown
                      </button>
                      <button className="btn-primary" onClick={() => {
                        playClickSound();
                        setShowResultsModal(true);
                      }}>
                        Show Details
                      </button>
                      <button className="btn-secondary" onClick={() => {
                        returnToLobby();
                      }}>
                        Back to Lobby
                      </button>
                    </div>
                  )}

                  {phase === 'ended' && showResultsModal && (
                    <GameResult
                      gameState={gameState}
                      p1Name={p1DisplayName}
                      p2Name={p2DisplayName}
                      ratingUpdates={ratingUpdates}
                      onRestart={handleRestart}
                      onViewBoard={() => setShowResultsModal(false)}
                      onClose={() => {
                        if (isOnlineGame) {
                          if (phase === 'ended') returnToLobby();
                          else handleCancelMatchmaking();
                        } else {
                          // Local mode reset - Keep local mode, just reset phase to setup
                          setPhase('setup');
                        }
                        setShowResultsModal(false);
                      }}
                    />
                  )}
                </footer>
              )}
            </>
          )}
        </>
      )}

      {showDiceAnimation && (
        <DiceRollOverlay
          targetValues={gameState.players[currentPlayerIndex].dice}
          onComplete={() => setShowDiceAnimation(false)}
          selectedSkin={selectedSkin}
        />
      )}
      {showRules && <RulesModal onClose={() => { playClickSound(); setShowRules(false); }} />}
      {showContactModal && (
        <ContactForm
          onClose={() => { playClickSound(); setShowContactModal(false); }}
          playerId={session?.user?.id}
        />
      )}

      {rematchInvited && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Rematch Request</h3>
            <p>Opponent wants to play again.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => {
                setRematchInvited(false);
              }}>Cancel</button>
              <button className="btn-primary" onClick={() => {
                setRematchInvited(false);
                socket.emit('accept_rematch', { roomId });
              }}>OK</button>
            </div>
          </div>
        </div>
      )}

      {rematchRequested && !rematchInvited && (
        <div style={{
          position: 'fixed',
          top: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)',
          padding: '10px 20px',
          borderRadius: '20px',
          color: 'white',
          zIndex: 3000
        }}>
          Waiting for opponent...
        </div>
      )}

      {/* Modals moved to global scope */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          // fetchElo();
        }}
      />
      <MyPage
        isOpen={showMyPage}
        onClose={() => setShowMyPage(false)}
        userId={dbPlayerId!}
        isPremium={isPremium}
        onNameChange={(newName) => {
          setPlayerName(newName);
          localStorage.setItem('xypoker_playerName_v2', newName);
        }}
      />
      <SkinStore
        isOpen={showSkinStore}
        onClose={() => setShowSkinStore(false)}
        userId={session?.user?.id}
        isPremium={isPremium}
        unlockedSkins={unlockedSkins}
        selectedSkin={selectedSkin}
        onUnlock={handleUnlockSkin}
        onSelect={handleSelectSkin}
        unlockedCardSkins={unlockedCardSkins}
        selectedCardSkin={selectedCardSkin}
        onUnlockCard={handleUnlockCardSkin}
        onSelectCard={handleSelectCardSkin}
        unlockedBoardSkins={unlockedBoardSkins}
        selectedBoardSkin={selectedBoardSkin}
        onUnlockBoard={handleUnlockBoardSkin}
        onSelectBoard={handleSelectBoardSkin}
      />

      {/* Finish Animation Overlay - only during scoring */}
      {showFinishAnimation && phase === 'scoring' && (
        <div className="finish-overlay">
          <h1 className="finish-text">FINISH!!</h1>
        </div>
      )}

      {/* Showdown popup overlay mounted at root to prevent transform misalignment */}
      <ShowdownPopup data={currentShowdownPopup} />
    </div>
  );
}

export default App;
