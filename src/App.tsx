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

import { DiceRollOverlay } from './components/DiceRollOverlay';
import { RulesModal } from './components/RulesModal';
import { TurnTimer } from './components/TurnTimer';
import { AuthModal } from './components/AuthModal';
import { MyPage } from './components/MyPage'; // [NEW]
import { updatePlayerStats, checkAchievements } from './logic/gamification'; // [NEW]
import { socket, connectSocket } from './logic/online';
import { supabase } from './supabase';
import './App.css';

import { getBestMove } from './logic/ai';
import { generateRandomPlayerName } from './logic/nameGenerator';
import { playClickSound, playSuccessSound, speakText, warmupAudio, initSpeech } from './utils/sound';
import { getBrowserId } from './utils/identity';

function App() {
  const [gameState, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const [phase, setPhase] = useState<'setup' | 'playing' | 'scoring' | 'ended'>('setup');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [placeHidden, setPlaceHidden] = useState(false);
  const [showDiceAnimation, setShowDiceAnimation] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(false);


  // Rematch State
  const [rematchRequested, setRematchRequested] = useState(false);

  const [rematchInvited, setRematchInvited] = useState(false);
  const [showFinishAnimation, setShowFinishAnimation] = useState(false);


  // Online State
  const [mode, setMode] = useState<'local' | 'online'>('local');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerRole, setPlayerRole] = useState<'host' | 'guest' | null>(null);
  const [isOnlineGame, setIsOnlineGame] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [isQuickMatch, setIsQuickMatch] = useState(false);
  const [isRankedGame, setIsRankedGame] = useState(false); // Track if current game is ranked
  const [scoringStep, setScoringStep] = useState(-1); // -1: hidden, 0-4: cols, 5: row

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
  useEffect(() => {
    // 1. Wait until profile is fully loaded
    if (!isProfileLoaded) return;

    // 2. If Premium, REMOVE script if it exists (Cleanup) and don't inject
    if (isPremium) {
      const existing = document.querySelector('script[data-zone="10307517"]');
      if (existing) {
        existing.remove();
        console.log('Premium user detected: Removed existing ad script.');
      }
      return;
    }

    // 3. Desktop Only Injection (Non-Premium)
    const isMobile = /Android|webOS|iPhone|iPad|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (window.innerWidth > 900 && !isMobile) {
      // Check if already injected
      const existing = document.querySelector('script[data-zone="10307517"]');
      if (!existing) {
        const s = document.createElement('script');
        s.dataset.zone = '10307517';
        s.src = 'https://nap5k.com/tag.min.js';
        document.body.appendChild(s);
      }
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

    socket.on('game_start', ({ roomId, initialDice, initialDeck, p1Name, p2Name, p1Id, p2Id, isRanked, p1IsPremium, p2IsPremium }: any) => {
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
      } else if (socket.id === p2Id) {
        setPlayerRole('guest');
        setOpponentName(p1Name || 'Player 1');
      }

      // Set player name and opponent name based on role
      // p1Name is always the host's name, p2Name is always the guest's name
      if (playerRole === 'host') {
        setPlayerName(p1Name);
        setOpponentName(p2Name);
      } else { // guest
        setPlayerName(p2Name);
        setOpponentName(p1Name);
      }

      setIsRankedGame(!!isRanked); // Update Ranked Flag

      dispatch({
        type: 'SYNC_STATE',
        payload: {
          ...INITIAL_GAME_STATE,
          players: [
            { ...INITIAL_GAME_STATE.players[0], id: p1Id, dice: initialDice, isPremium: !!p1IsPremium },
            { ...INITIAL_GAME_STATE.players[1], id: p2Id, dice: initialDice, isPremium: !!p2IsPremium }
          ],
          deck: initialDeck,
          phase: 'playing'
        }
      });
      playSuccessSound();
      console.log(`Game started in room ${roomId} (Ranked: ${isRanked})`);
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
      socket.off('request_sync');
      socket.off('auto_start_game');
      socket.off('opponent_joined');
      socket.off('game_action');
      socket.off('game_end_surrender');
      socket.off('player_left');
      // Don't disconnect on cleanup - only when component unmounts
    };
  }, []); // Empty dependency array - only run once on mount


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

      // 2. Wait 2 seconds, then Calculate
      const timer = setTimeout(() => {
        setShowFinishAnimation(false);
        // Dispatch calculate (locally for both players, as they both reach this phase)
        dispatch({ type: 'CALCULATE_SCORE' });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [phase]);

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
  useEffect(() => {
    if (gameState.winner) {
      setPhase('ended');
    } else if (gameState.phase === 'scoring') {
      setPhase('scoring');
    } else if (gameState.turnCount > 0) {
      setPhase('playing');
    }
  }, [gameState]);

  // AI Turn Logic (Example)
  useEffect(() => {
    if (mode === 'local' && phase === 'playing' && currentPlayerIndex === 1 && !showDiceAnimation) {
      // Disguised Bot: 2000ms - 5000ms delay
      // Standard AI: 1000ms fixed
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
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [gameState, mode, isBotDisguise, phase, showDiceAnimation]); // Added showDiceAnimation dependency

  // User Auto-Play Logic (Both Local P1 and Online Self)
  useEffect(() => {
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
  }, [isAutoPlay, phase, currentPlayerIndex, mode, isOnlineGame, playerRole, roomId, gameState, showDiceAnimation]); // Added showDiceAnimation dependency

  useEffect(() => {
    if (phase === 'ended') {
      // Start scoring animation sequence
      // Steps: 0-4 (Cols), 5 (Row)

      let step = 0;
      setScoringStep(0);

      // Pre-calculate winners and hand names for valid speech
      const { players } = gameState;
      const p1 = players[0];
      const p2 = players[1];
      const dice = p1.dice; // Shared dice values

      // Helper to map type ID to readable string
      const getReadableHandName = (typeId: string): string => {
        // Simple mapping from PascalCase to Spaced String
        // e.g. ThreeOfAKind -> Three of a Kind
        return typeId.replace(/([A-Z])/g, ' $1').trim().replace(/ Of /g, ' of ').replace(/ A /g, ' a ');
      };

      // Col Results (Right-to-Left: 4 -> 0)
      const colResults = Array.from({ length: 5 }, (_, i) => {
        const colIndex = 4 - i; // 4, 3, 2, 1, 0
        const p1Cards = [p1.board[0][colIndex]!, p1.board[1][colIndex]!, p1.board[2][colIndex]!];
        const p2Cards = [p2.board[0][colIndex]!, p2.board[1][colIndex]!, p2.board[2][colIndex]!];

        const p1Res = evaluateYHand(p1Cards, dice[colIndex]);
        const p2Res = evaluateYHand(p2Cards, dice[colIndex]);

        if (p1Res.rankValue > p2Res.rankValue) return { winner: 'p1', type: p1Res.type };
        if (p2Res.rankValue > p1Res.rankValue) return { winner: 'p2', type: p2Res.type };

        // Tie-breaker logic (Kicker)
        for (let k = 0; k < Math.max(p1Res.kickers.length, p2Res.kickers.length); k++) {
          const k1 = p1Res.kickers[k] || 0;
          const k2 = p2Res.kickers[k] || 0;
          if (k1 > k2) return { winner: 'p1', type: p1Res.type };
          if (k2 > k1) return { winner: 'p2', type: p2Res.type };
        }
        return { winner: 'draw', type: null };
      });

      // Row Result (X-Hand)
      const p1XRes = evaluateXHand(p1.board[2] as Card[]);
      const p2XRes = evaluateXHand(p2.board[2] as Card[]);

      // Prevent multiple triggers for the same game end state
      // Use roomId + winner or just simple phase check with reset
      const gameSignature = `${roomId}-${gameState.winner}-${gameState.turnCount}`; // unique enough
      if (processedGameRef.current === gameSignature) {
        // Already started animation for this game end, do not restart
        // But we need to keep the interval logic if it was in component state...
        // Actually, if we return early, we might break the interval if this effect re-runs.
        // So if we return early, the animation stops.

        // Better approach: Only GUARD the "Initial Speech" and "Start",
        // but allow the effect to mount?
        // No, if the effect re-mounts, we want to CONTINUE or just DO NOTHING if it's already done?
        // If we want to ensure it runs EXACTLY ONCE, we should just check if we are already scoring.
        // But `scoringStep` state will be preserved? No, `setScoringStep(-1)` is called in the else block.
        // Getting complicated. Simple fix:
        // Just rely on speech cancel?
        // The issue is likely the effect running twice quickly.
        return;
      }
      processedGameRef.current = gameSignature;

      // Calculate Results locally for display
      // The original colResults and rowResult calculations are already done above.
      // This part of the instruction seems to be a re-calculation or a placeholder for a refactor.
      // Keeping the original calculations and just adding the ref check.
      // If `calculateColumnResults` and `calculateXHandScores` are new helper functions,
      // they would need to be defined elsewhere. Assuming the existing `colResults` and `p1XRes`/`p2XRes`
      // are the intended source for the `rowResult` calculation.
      const { p1Score: p1X, p2Score: p2X } = calculateXHandScores(p1XRes, p2XRes);
      let rowResult = { winner: 'draw', type: null as string | null };
      if (p1X > p2X) rowResult = { winner: 'p1', type: p1XRes.type };
      else if (p2X > p1X) rowResult = { winner: 'p2', type: p2XRes.type };

      // Initial Speech (Step 0)
      const initialRes = colResults[0];
      if (initialRes.winner !== 'draw' && initialRes.type) {
        speakText(getReadableHandName(initialRes.type));
      }
      playClickSound();

      const interval = setInterval(() => {
        step++;
        if (step <= 5) {
          setScoringStep(step);
          playClickSound();

          // Speak logic
          let res: { winner: string, type: string | null } | null = null;
          if (step <= 4) {
            res = colResults[step];
          } else if (step === 5) {
            res = rowResult;
          }

          if (res && res.winner !== 'draw' && res.type) {
            // Slight delay for speech to not clash perfectly with click sound?
            // Or just fire it. Browsers handle overlapping/queuing or replace.
            // speakText cancels previous, so it's fine.
            speakText(getReadableHandName(res.type));
          }

        } else {
          // Finished
          clearInterval(interval);
          setTimeout(() => {
            // Auto-show modal for everyone now that finish is automatic
            setShowResultsModal(true);
          }, 1000);
        }
      }, 1500); // Increased to 1500ms to allow speech time

      if (mode === 'local') {
        const { winner } = gameState;
        const aiWon = winner === 'p2';
        const isDraw = winner === null;
        recordGameResult(aiWon, isDraw);

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
    }

    dispatch({ type: 'START_GAME' });
    setShowDiceAnimation(true);
    setShowResultsModal(false);
    processedGameRef.current = null; // Reset animation trigger
    setScoringStep(-1);
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
        handleCancelMatchmaking();
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
    <div className={`app ${isLobbyView ? 'view-lobby' : 'view-game'} phase-${phase}`}>
      <header className={`app-header ${(phase === 'playing' || phase === 'scoring') ? 'battle-mode' : ''}`}>
        <div className="header-title-row">
          <h1>XY Poker</h1>
          {showVersion && <span className="version">12151458</span>}
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
                <button
                  onClick={() => supabase.auth.signOut()}
                  style={{ padding: '4px 8px', fontSize: '0.7rem', background: 'rgba(0,0,0,0.5)', border: '1px solid #555', color: '#ccc', borderRadius: '4px', cursor: 'pointer', marginLeft: '5px' }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                style={{ padding: '6px 12px', background: '#4da8da', border: 'none', color: '#000', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
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
            />
          ) : (
            <>
              {/* Auth Modal */}
              <AuthModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                onSuccess={() => {
                  // fetchElo(); // Refetch elo on login
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

              {/* Skin Store Modal */}
              <SkinStore
                isOpen={showSkinStore}
                onClose={() => setShowSkinStore(false)}
                userId={session?.user?.id}
                isPremium={isPremium} // [NEW]
                // Dice
                unlockedSkins={unlockedSkins}
                selectedSkin={selectedSkin}
                onUnlock={handleUnlockSkin}
                onSelect={handleSelectSkin}
                // Cards
                unlockedCardSkins={unlockedCardSkins}
                selectedCardSkin={selectedCardSkin}
                onUnlockCard={handleUnlockCardSkin}
                onSelectCard={handleSelectCardSkin}
                // Boards
                unlockedBoardSkins={unlockedBoardSkins}
                selectedBoardSkin={selectedBoardSkin}
                onUnlockBoard={handleUnlockBoardSkin}
                onSelectBoard={handleSelectBoardSkin}
              />

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
                          If you encounter any issues, please let us know via the <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setShowContactModal(true)}>Report form</span>.
                        </div>
                      </>
                    )}
                  </div>
                )}
                {(phase === 'playing' || phase === 'scoring' || phase === 'ended') && (
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
                      scoringStep={scoringStep}
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

                    {/* Check if it is valid for ME to see controls (My turn or Auto is on?) */}
                    {/* Actually, show Auto toggle always? Or only during my turn? */}
                    {/* Better always visible in footer if playing */}
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
                        Auto: {isAutoPlay ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </>
                )}

                {phase === 'scoring' && (
                  <div className="status-message">
                    Calculating Scores...
                  </div>
                )}

                {phase === 'ended' && !showResultsModal && (
                  <div className="end-game-controls" style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-primary" onClick={() => {
                      playClickSound();

                      // If it was already finished (scoringStep > 5 or modal closed), this might just re-run effect?
                      // Actually if modal was closed, we might want to just open modal.
                      // But for simplicity, let's just Open Modal if animation is done?
                      // No, let's just Set Show Results Modal directly if we want to skip.
                      // But user wants to SEE the result?
                      // If scoringStep == -1, we should Start Animation.
                      if (scoringStep === -1) {
                        setScoringStep(0); // Restart animation manually if needed
                      } else {
                        setShowResultsModal(true);
                      }
                    }}>
                      {scoringStep === -1 ? 'Show Results' : 'Show Details'}
                    </button>
                    <button className="btn-secondary" onClick={() => {
                      playClickSound();
                      // Emit leave room to stop receiving updates
                      if (roomId) {
                        socket.emit('leave_room', { roomId });
                      }

                      setMode('online');
                      setRoomId(null);
                      setPlayerRole(null);
                      setIsOnlineGame(false);
                      setIsQuickMatch(false);
                      setRatingUpdates(null);
                      setPhase('setup'); // Force reset phase
                      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE } as any);
                    }}>
                      Back to Lobby
                    </button>
                  </div>
                )}

                {phase === 'ended' && showResultsModal && (
                  <GameResult
                    gameState={gameState}
                    onRestart={handleRestart}
                    onClose={() => {
                      if (isOnlineGame) handleCancelMatchmaking(); // Leave room
                      else {
                        setMode('online'); // Back to lobby
                        setPhase('setup');
                      }
                      setShowResultsModal(false);
                      setScoringStep(-1);
                    }}
                    onViewBoard={() => setShowResultsModal(false)}
                    p1Name={p1DisplayName}
                    p2Name={p2DisplayName}
                    ratingUpdates={ratingUpdates}
                  />
                )}
              </footer>
            </>
          )}
        </>
      )
      }

      {
        showDiceAnimation && (
          <DiceRollOverlay
            targetValues={gameState.players[currentPlayerIndex].dice}
            onComplete={() => setShowDiceAnimation(false)}
            selectedSkin={selectedSkin}
          />
        )
      }
      {/* Rules Overlay */}
      {showRules && <RulesModal onClose={() => { playClickSound(); setShowRules(false); }} />}
      {/* Contact Form Overlay */}
      {showContactModal && (
        <ContactForm
          onClose={() => { playClickSound(); setShowContactModal(false); }}
          playerId={session?.user?.id}
        />
      )}
      {/* Rematch Modal */}
      {
        rematchInvited && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>Rematch Request</h3>
              <p>Opponent wants to play again.</p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => {
                  setRematchInvited(false);
                  // Optional: emit decline?
                }}>Cancel</button>
                <button className="btn-primary" onClick={() => {
                  setRematchInvited(false); // Close modal immediately
                  socket.emit('accept_rematch', { roomId });
                }}>OK</button>
              </div>
            </div>
          </div>
        )
      }

      {/* Waiting for Rematch Modal (Optional feedback for requester) */}
      {
        rematchRequested && !rematchInvited && (
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
        )
      }

      {/* Finish Animation Overlay - only during scoring */}
      {
        showFinishAnimation && phase === 'scoring' && (
          <div className="finish-overlay">
            <h1 className="finish-text">FINISH!!</h1>
          </div>
        )
      }
    </div>
  );
}

export default App;
