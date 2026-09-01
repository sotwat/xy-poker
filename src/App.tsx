import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { gameReducer, INITIAL_GAME_STATE, type GameAction } from './logic/game';
import { evaluateYHand, evaluateXHand } from './logic/evaluation';
import { calculateXHandScores } from './logic/scoring';
import { recordGameResult } from './logic/aiLearning';
import type { BoardSkin, Card, CardSkin, DiceSkin, GameState, Phase } from './logic/types';
import { SharedBoard } from './components/SharedBoard';
import { Hand } from './components/Hand';
import { GameInfo } from './components/GameInfo';
import { Lobby } from './components/Lobby';
import { DiceRollOverlay } from './components/DiceRollOverlay';
import { TurnTimer } from './components/TurnTimer';
import type { PopupData } from './components/ShowdownPopup';
import { updatePlayerStats } from './logic/gamification';
import { socket, connectSocket } from './logic/online';
import { supabase, fetchGlobalAiParameters, updateGlobalAiParameters } from './supabase';
import { getBestMove, getBestTurnOrder, DEFAULT_AI_PARAMS, setGlobalAiParams } from './logic/ai';
import { generateRandomPlayerName } from './logic/nameGenerator';
import { playClickSound, playSuccessSound, playCoinTossSound, speakText, warmupAudio, initSpeech, unlockAudioContext } from './utils/sound';
import { getBrowserId } from './utils/identity';
import './App.css';

const GameResult = lazy(() => import('./components/GameResult').then(module => ({ default: module.GameResult })));
const SkinStore = lazy(() => import('./components/SkinStore').then(module => ({ default: module.SkinStore })));
const ContactForm = lazy(() => import('./components/ContactForm'));
const RulesModal = lazy(() => import('./components/RulesModal').then(module => ({ default: module.RulesModal })));
const AuthModal = lazy(() => import('./components/AuthModal').then(module => ({ default: module.AuthModal })));
const MyPage = lazy(() => import('./components/MyPage').then(module => ({ default: module.MyPage })));
const ShowdownPopup = lazy(() => import('./components/ShowdownPopup').then(module => ({ default: module.ShowdownPopup })));

interface RatingChange {
  old: number;
  new: number;
  change: number;
}

interface RatingUpdates {
  p1: RatingChange;
  p2: RatingChange;
}

interface GameStartPayload {
  roomId: string;
  initialDice: number[];
  initialDeck: Card[];
  p1Name: string;
  p2Name: string;
  p1Id: string;
  p2Id: string;
  isRanked: boolean;
  p1IsPremium?: boolean;
  p2IsPremium?: boolean;
  startingPlayer: 0 | 1;
}

interface RoomResponse {
  success?: boolean;
  roomId?: string;
  role?: 'host' | 'guest';
  opponentName?: string;
  message?: string;
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const SKIN_EXPIRY_MS = 3 * 60 * 60 * 1000;

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function loadSkins<T extends string>(storageKey: string, timeKey: string, defaults: T[]): T[] {
  const storedSkins = readStoredJson<unknown>(storageKey, defaults);
  const skins = Array.isArray(storedSkins) ? storedSkins.filter((skin): skin is T => typeof skin === 'string') : defaults;
  const storedTimes = readStoredJson<unknown>(timeKey, {});
  const times = storedTimes && typeof storedTimes === 'object' ? storedTimes as Record<string, number> : {};

  const now = Date.now();
  let hasChanges = false;
  const nextSkins: T[] = [];
  const nextTimes = { ...times };

  skins.forEach(skin => {
    if (defaults.includes(skin)) {
      nextSkins.push(skin);
      return;
    }

    if (!nextTimes[skin]) {
      nextTimes[skin] = now;
      hasChanges = true;
    }

    if (now - nextTimes[skin] < SKIN_EXPIRY_MS) {
      nextSkins.push(skin);
    } else {
      delete nextTimes[skin];
      hasChanges = true;
    }
  });

  defaults.forEach(defaultSkin => {
    if (!nextSkins.includes(defaultSkin)) nextSkins.push(defaultSkin);
  });

  if (hasChanges) {
    localStorage.setItem(storageKey, JSON.stringify(nextSkins));
    localStorage.setItem(timeKey, JSON.stringify(nextTimes));
  }
  return nextSkins;
}

function loadSelectedSkin<T extends string>(key: string, defaultSkin: T, unlockedList: T[]): T {
  const saved = localStorage.getItem(key) as T | null;
  return saved && unlockedList.includes(saved) ? saved : defaultSkin;
}

function unlockSkinGeneric<T extends string>(
  skinId: T,
  currentList: T[],
  setList: (list: T[]) => void,
  listKey: string,
  timeKey: string,
  setSelected: (skin: T) => void,
  selectedKey: string,
) {
  const nextUnlocked = Array.from(new Set([...currentList, skinId]));
  setList(nextUnlocked);
  localStorage.setItem(listKey, JSON.stringify(nextUnlocked));

  const currentTimes = readStoredJson<Record<string, number>>(timeKey, {});
  localStorage.setItem(timeKey, JSON.stringify({ ...currentTimes, [skinId]: Date.now() }));
  setSelected(skinId);
  localStorage.setItem(selectedKey, skinId);
}

function App() {
  const [gameState, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const phase = gameState.phase;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [placeHidden, setPlaceHidden] = useState(false);
  const [showDiceAnimation, setShowDiceAnimation] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(false);

  // Rematch State
  const [rematchRequested, setRematchRequested] = useState(false);

  const [rematchInvited, setRematchInvited] = useState(false);

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
  const [ratingUpdates, setRatingUpdates] = useState<RatingUpdates | null>(null);
  const [isBotDisguise, setIsBotDisguise] = useState(false);
  const processedGameRef = useRef<string | null>(null); // Guard for scoring animation
  const showdownRunRef = useRef(0);
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
  const [session, setSession] = useState<Session | null>(null);
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
  const [showSkinStore, setShowSkinStore] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  // My Page State
  const [showMyPage, setShowMyPage] = useState(false);
  const [dbPlayerId, setDbPlayerId] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (isSessionLoading) return;

    let cancelled = false;
    const loadProfile = async () => {
      await Promise.resolve();
      if (!session?.user.id) {
        if (!cancelled) {
          setDbPlayerId(null);
          setIsPremium(false);
        }
        return;
      }

      const { data } = await supabase
        .from('players')
        .select('id, is_premium, username')
        .eq('id', session.user.id)
        .single();

      if (cancelled) return;
      setDbPlayerId(data?.id ?? null);
      setIsPremium(Boolean(data?.is_premium));
      if (data?.username) {
        setPlayerName(data.username);
        localStorage.setItem('xypoker_playerName_v2', data.username);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [session, isSessionLoading]);

  const handleChooseTurnOrder = useCallback((startingPlayer: number) => {
    setTurnSelectionTimeLeft(null);
    setIsTossingCoin(false);
    setTossResult(null);
    const action: GameAction = { type: 'CHOOSE_TURN_ORDER', payload: { startingPlayer } };
    dispatch(action);
    if (isOnlineGame && roomId) {
      socket.emit('game_action', { roomId, action });
    }
  }, [isOnlineGame, roomId]);

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
  const quickMatchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActionTimeRef = useRef<number>(0);
  const isAIActingRef = useRef<boolean>(false); // Guard against double AI moves
  const localGameTokenRef = useRef<string | null>(null);

  const beginTrackedLocalGame = useCallback(() => {
    localGameTokenRef.current = null;
    if (!dbPlayerId || !socket.connected) return;
    socket.emit('start_local_game', {}, (response: { success: boolean; token?: string }) => {
      if (response.success && response.token) localGameTokenRef.current = response.token;
    });
  }, [dbPlayerId]);

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
    socket.on('player_joined', ({ roomId, role, opponentName }: { roomId: string; role: 'host'; opponentName?: string }) => {
      setRoomId(roomId);
      setPlayerRole(role);
      if (opponentName) setOpponentName(opponentName);
      setIsOnlineGame(true);
      setMode('online');
    });

    socket.on('sync_state', (remoteState: GameState) => {
      // Guard: Only accept sync if we are actually in a room
      if (!roomIdRef.current) return;

      dispatch({ type: 'SYNC_STATE', payload: remoteState });
      // setIsOnlineGame(true); // Don't force this true here? Or maybe fine if we are in room.
      // Actually, if we are in lobby (roomId null), we returned above.
      // If we are in room, we are seemingly online.
      setIsOnlineGame(true);
    });

    socket.on('request_sync', () => {
      // Host is authority.
      if (playerRoleRef.current === 'host' && roomIdRef.current) {
        socket.emit('sync_state', {
          roomId: roomIdRef.current,
          state: gameStateRef.current
        });
      }
    });

    socket.on('opponent_joined', ({ name }: { name: string }) => {
      setOpponentName(name);
      playSuccessSound();
    });

    socket.on('rematch_requested', () => {
      setRematchInvited(true);
      playSuccessSound();
    });

    socket.on('game_start', (data: GameStartPayload) => {
      const {
        roomId, initialDice, initialDeck, p1Name, p2Name, p1Id, p2Id,
        isRanked, p1IsPremium, p2IsPremium, startingPlayer
      } = data;

      setMode('online');
      setRoomId(roomId);
      setIsQuickMatch(false); // Clear quick match status
      setIsOnlineGame(true); // Confirm online game status
      setRematchRequested(false); // Clear any pending rematch requests
      setRematchInvited(false); // Clear any pending rematch invitations
      setIsTossingCoin(false);
      setTossResult(null);
      setTurnSelectionTimeLeft(null);
      processedGameRef.current = null;

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
            p1: { id: p1Id, isPremium: Boolean(p1IsPremium) },
            p2: { id: p2Id, isPremium: Boolean(p2IsPremium) }
          }
        }
      });

      playSuccessSound();
      setShowDiceAnimation(true); // Show dice animation for everyone
      setShowResultsModal(false); // Ensure results modal is hidden
    });

    socket.on('player_data', (data: { rating?: number }) => {
      if (data && data.rating) {
        setMyRating(data.rating);
      }
    });

    socket.on('rating_update', (updates: RatingUpdates) => {
      setRatingUpdates(updates);

      // Update local rating state immediately so Lobby shows correct value
      if (playerRoleRef.current === 'host') {
        setMyRating(updates.p1.new);
      } else if (playerRoleRef.current === 'guest') {
        setMyRating(updates.p2.new);
      }
    });

    socket.on('game_action', (action: GameAction) => {
      dispatch(action);
    });

    socket.on('game_end_surrender', () => {
      // Ignore if we are in local mode (bot match)
      if (modeRef.current === 'local') return;

      // Handle surrender ending the game

      // Return to lobby after 1 second (showing winner briefly)
      setTimeout(() => {
        // Reset all state at once using functional updates
        setMode(() => 'online');
        setRoomId(() => null);
        setPlayerRole(() => null);
        setIsOnlineGame(() => false);
        setIsQuickMatch(() => false);
        setOpponentName(() => 'Player 2');
        setRatingUpdates(null); // Clear rating updates
        setRematchRequested(false);
        setRematchInvited(false);

        // Reset game state to initial
        dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE });
      }, 1000);
    });

    socket.on('player_left', () => {
      // Ignore if we are in local mode (bot match)
      // This is critical because cancelling matchmaking might trigger player_left from server
      if (modeRef.current === 'local') {
        return;
      }

      // Opponent left/cancelled - return to lobby
      setMode('online');
      setRoomId(null);
      setPlayerRole(null);
      setIsOnlineGame(false);
      setIsQuickMatch(false);
      setRatingUpdates(null);
      setRematchRequested(false);
      setRematchInvited(false);
      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE });
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game_start');
      socket.off('player_data'); // Clean up
      socket.off('rating_update');
      socket.off('player_joined');
      socket.off('sync_state');
      socket.off('request_sync');
      socket.off('opponent_joined');
      socket.off('game_action');
      socket.off('game_end_surrender');
      socket.off('player_left');
      // Don't disconnect on cleanup - only when component unmounts
    };
  }, [session?.access_token]);

  // Rating: Handle Game End Report (Host only)
  useEffect(() => {
    // Only report for RANKED games
    if (isOnlineGame && isRankedGame && playerRole === 'host' && roomId && gameState.phase === 'ended' && gameState.winner !== null) {
      socket.emit('report_game_end', {
        roomId,
        winner: gameState.winner,
      });
    }
  }, [gameState, isOnlineGame, isRankedGame, playerRole, roomId]);

  const { currentPlayerIndex, players } = gameState;
  const currentPlayer = players[currentPlayerIndex];

  // Auto-Finish Logic
  useEffect(() => {
    if (phase === 'scoring') {
      playSuccessSound();

      // 2. Wait 2 seconds, then Calculate
      const timer = setTimeout(() => {
        dispatch({ type: 'CALCULATE_SCORE' });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Turn Selection Logic
  useEffect(() => {
    let timer2: ReturnType<typeof setTimeout>;

    if (phase !== 'turn_selection' || showDiceAnimation) return;

    const timer1 = setTimeout(() => {
      const winner = currentPlayerIndex as 0 | 1;
      setIsTossingCoin(true);
      playCoinTossSound();
      setTossResult(winner);

      timer2 = setTimeout(() => {
        setIsTossingCoin(false);
        const isMyChoice = mode === 'local'
          ? winner === 0
          : (playerRole === 'host' && winner === 0) || (playerRole === 'guest' && winner === 1);
        if (isMyChoice) setTurnSelectionTimeLeft(10);
      }, 1400);
    }, 500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [currentPlayerIndex, mode, phase, playerRole, showDiceAnimation]);

  // AI Turn Selection Logic (When AI wins the toss)
  useEffect(() => {
    if (phase === 'turn_selection' && !isTossingCoin && tossResult !== null && !isOnlineGame && currentPlayerIndex === 1) {
      // AI won the toss! Evaluate hand strength to choose First or Second
      const shouldGoFirst = getBestTurnOrder(gameState, 1, DEFAULT_AI_PARAMS);

      const timer = setTimeout(() => {
        const chosenStartingPlayer = shouldGoFirst ? 1 : 0;
        handleChooseTurnOrder(chosenStartingPlayer);
      }, 700);

      return () => clearTimeout(timer); // ← クリーンアップ: 二重発火を防ぐ
    }
  }, [currentPlayerIndex, gameState, handleChooseTurnOrder, isOnlineGame, isTossingCoin, phase, tossResult]);

  // Turn Selection Timer Tick
  useEffect(() => {
    if (turnSelectionTimeLeft !== null && turnSelectionTimeLeft > 0) {
      const timer = setTimeout(() => {
        setTurnSelectionTimeLeft(turnSelectionTimeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (turnSelectionTimeLeft === 0) {
      const timer = window.setTimeout(() => {
        const myIndex = mode === 'online' && playerRole === 'guest' ? 1 : 0;
        const opIndex = mode === 'online' && playerRole === 'guest' ? 0 : 1;
        handleChooseTurnOrder(Math.random() > 0.5 ? myIndex : opIndex);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [handleChooseTurnOrder, mode, playerRole, turnSelectionTimeLeft]);

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
  const prevPhaseRef = useRef<Phase>('setup');
  useEffect(() => {
    const enteredPlaying = gameState.phase === 'playing' && prevPhaseRef.current !== 'playing';
    prevPhaseRef.current = gameState.phase;
    if (!enteredPlaying) return;

    const firstIdx = gameState.currentPlayerIndex;
    const first = firstIdx === 0 ? p1DisplayName : p2DisplayName;
    const second = firstIdx === 0 ? p2DisplayName : p1DisplayName;
    const showTimer = window.setTimeout(() => {
      setTurnAnnounce({ firstName: first, secondName: second });
    }, 0);
    const hideTimer = window.setTimeout(() => {
      setTurnAnnounce(null);
    }, 3000);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [gameState.currentPlayerIndex, gameState.phase, p1DisplayName, p2DisplayName]);

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
  }, [currentPlayerIndex, gameState, isBotDisguise, mode, phase, showDiceAnimation, turnAnnounce]);

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

        const action: GameAction = {
          type: 'PLACE_AND_DRAW',
          payload: {
            cardId: move.cardId,
            colIndex: move.colIndex,
            isHidden: move.isHidden
          }
        };

        playClickSound(); // Feedback
        dispatch(action);

        if (isOnlineGame && roomId) {
          socket.emit('game_action', { roomId, action });
        }
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [isAutoPlay, phase, currentPlayerIndex, mode, isOnlineGame, playerRole, roomId, gameState, showDiceAnimation, turnAnnounce]);

  // Showdown sequence runner (Re-usable for Replay Showdown)
  useEffect(() => {
    if (phase !== 'ended') showdownRunRef.current += 1;
  }, [phase]);

  const triggerShowdownSequence = useCallback(async () => {
    const runId = ++showdownRunRef.current;
    const isCurrentRun = () => showdownRunRef.current === runId;
    const wait = (duration: number) => new Promise<void>(resolve => window.setTimeout(resolve, duration));

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
            wait(2200),
          ]);
        } else {
          await wait(2200);
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
            wait(2200),
          ]);
        } else {
          await wait(2200);
        }
      }

      if (!isCurrentRun()) return;
      await wait(100);
      if (!isCurrentRun()) return;
    }

    await wait(2500);
    if (!isCurrentRun()) return;
    setCurrentShowdownPopup(null);
    setShowResultsModal(true);
  }, [gameState]);

  useEffect(() => {
    if (phase === 'ended') {
      const gameSignature = `${roomId}-${gameState.winner}-${gameState.turnCount}`;
      if (processedGameRef.current === gameSignature) {
        return;
      }
      processedGameRef.current = gameSignature;

      void triggerShowdownSequence();

      if (mode === 'local') {
        const { winner } = gameState;
        const aiWon = winner === 'p2';
        const isDraw = winner === 'draw';
        recordGameResult(aiWon, isDraw);

        // Contribute game outcome to the global collaborative AI parameters
        const gameToken = localGameTokenRef.current;
        if ((opponentName === 'AI' || isBotDisguise) && dbPlayerId && gameToken) {
          updateGlobalAiParameters(aiWon, isDraw, gameToken);
        }

        // Update Gamification Stats (Only if logged in and I am Player 1 against AI)
        if (dbPlayerId && gameToken) {
          let resultStr: 'win' | 'loss' | 'draw' = 'draw';
          if (!aiWon && !isDraw) resultStr = 'win';
          else if (aiWon) resultStr = 'loss';

          updatePlayerStats(dbPlayerId, resultStr, gameToken).then(res => {
            if (res?.leveledUp) {
              alert(`Level Up! You are now Level ${res.newLevel}`);
            }
          });
        }
        localGameTokenRef.current = null;
      }
    }
  }, [dbPlayerId, gameState, isBotDisguise, mode, opponentName, phase, roomId, triggerShowdownSequence]);

  useEffect(() => {
    localStorage.setItem('xypoker_playerName_v2', playerName);
  }, [playerName]);

  // Fetch data when connection or session changes
  useEffect(() => {
    if (isConnected) {
      const id = getBrowserId(); // Use utility to get or create
      const userId = session?.user?.id;
      // Re-fetch player data when session maps
      socket.emit('get_player_data', { browserId: id, userId });
    }
  }, [isConnected, session]); // Trigger on session change too

  const handleAutoPlay = useCallback(() => {
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
      return;
    }

    const currentPlayer = gameState.players[currentPlayerIndex];
    if (currentPlayer.hand.length === 0) return; // Should not happen in playing phase

    // Pick random card
    const randomCardIndex = Math.floor(Math.random() * currentPlayer.hand.length);
    const card = currentPlayer.hand[randomCardIndex];

    // Find valid columns
    const validCols: number[] = [];
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

    const action: GameAction = {
      type: 'PLACE_AND_DRAW',
      payload: {
        cardId: card.id,
        colIndex: randomCol,
        isHidden: false // Random placement is public
      }
    };

    dispatch(action);
    playClickSound();

    if (isOnlineGame && roomId) {
      socket.emit('game_action', { roomId, action });
    }
  }, [currentPlayerIndex, gameState, isOnlineGame, phase, playerRole, roomId]);

  useEffect(() => {
    if (phase !== 'playing' || showDiceAnimation) return;

    let remaining = 60;
    const resetTimer = window.setTimeout(() => setTimeLeft(remaining), 0);
    const timer = window.setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        handleAutoPlay();
      }
    }, 1000);

    return () => {
      window.clearTimeout(resetTimer);
      window.clearInterval(timer);
    };
  }, [currentPlayerIndex, handleAutoPlay, phase, showDiceAnimation]);

  const handleStartGame = () => {
    playClickSound();
    warmupAudio(); // Resume AudioContext
    initSpeech();  // Unlock SpeechSynthesis

    // Explicitly reset disguise for manual local starts (e.g. from Setup screen)
    if (mode === 'local') {
      beginTrackedLocalGame();
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
    setIsTossingCoin(false);
    setTossResult(null);
    setTurnSelectionTimeLeft(null);
    setShowDiceAnimation(true);
    setShowResultsModal(false);
    processedGameRef.current = null; // Reset animation trigger
    setRevealedCols([]);
    setShowXHand(false);
    setCurrentShowdownPopup(null);
  };

  const startBotMatch = () => {
    beginTrackedLocalGame();

    // Get current roomId using ref
    const currentRoomId = roomIdRef.current;

    // Cancel socket request
    if (currentRoomId) {
      socket.emit('cancel_matchmaking', { roomId: currentRoomId });
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
    dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE });

    // Slight delay to allow state updates before starting
    setTimeout(() => {
      playSuccessSound();
      dispatch({ type: 'START_GAME' });
      setIsTossingCoin(false);
      setTossResult(null);
      setTurnSelectionTimeLeft(null);
      setShowDiceAnimation(true);
    }, 500);
  };

  const handleCreateRoom = () => {
    const browserId = getBrowserId();
    const userId = session?.user?.id;
    socket.emit('create_room', { playerName, browserId, userId }, (response: RoomResponse) => {
      if (response.roomId) {
        setRoomId(response.roomId);
        setPlayerRole('host');
      }
    });
  };
  const handleJoinRoom = (id: string) => {
    const browserId = getBrowserId();
    const userId = session?.user?.id;
    socket.emit('join_room', { roomId: id, playerName, browserId, userId }, (response: RoomResponse) => {
      if (response.success) {
        setRoomId(id);
        setPlayerRole('guest');
        if (response.opponentName) {
          setOpponentName(response.opponentName);
        }
      } else {
        alert(response.message ?? 'Unable to join this room.');
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
        dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE });
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
    socket.emit('quick_match', { playerName, browserId, userId }, (response: RoomResponse) => {
      if (response.success && response.roomId && response.role) {
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
    setRematchRequested(false);
    setRematchInvited(false);
    dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE });
  };

  const handleCancelMatchmaking = () => {
    playClickSound();
    if (quickMatchTimeoutRef.current) {
      clearTimeout(quickMatchTimeoutRef.current);
    }

    if (mode === 'local') {
      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE });
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
      dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE });
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

    const action: GameAction = {
      type: 'PLACE_AND_DRAW',
      payload: {
        cardId: selectedCardId,
        colIndex,
        isHidden: placeHidden,
      }
    };
    dispatch(action);

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
      const fullscreenDocument = document as FullscreenDocument;
      const isFs = !!(document.fullscreenElement || fullscreenDocument.webkitFullscreenElement);
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
      const fullscreenDocument = document as FullscreenDocument;
      const fullscreenElement = document.documentElement as FullscreenElement;
      const currentFs = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement;

      if (!currentFs) {
        if (fullscreenElement.requestFullscreen) {
          await fullscreenElement.requestFullscreen();
        } else if (fullscreenElement.webkitRequestFullscreen) {
          await fullscreenElement.webkitRequestFullscreen();
        } else {
          // Fallback for iOS Safari which usually doesn't support DOM fullscreen API
          alert("Fullscreen API not supported on this device/browser.\nTry 'Add to Home Screen' for fullscreen experience.");
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (fullscreenDocument.webkitExitFullscreen) {
          await fullscreenDocument.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.error("Error toggling fullscreen:", err);
      // alert("Error entering fullscreen: " + err); // Optional debug
    }
  };

  return (
    <div className={`app ${isLobbyView ? 'view-lobby' : 'view-game'} phase-${phase} ${phase === 'scoring' ? 'showdown-active' : ''}`}>

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
          {showVersion && <span className="version">v09012057</span>}
        </div>

        <button
          type="button"
          className="btn-fullscreen"
          onClick={toggleFullscreen}
          aria-label="Toggle Fullscreen"
        >
          {isFullscreen ? '⊠' : '⛶'}
        </button>

        {/* Auth Button (Top Right) */}
        {!isOnlineGame && phase === 'setup' && (
          <div className="auth-status">
            {session ? (
              <div className="auth-user">
                <div className="auth-user-copy">
                  <span>{session.user.email}</span>
                  <small>ID: {session.user.id.slice(0, 8)}</small>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMyPage(true)}
                  className="btn-account"
                >
                  Account
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-auth"
                onClick={() => setShowAuthModal(true)}
              >
                Sign in
              </button>
            )}
          </div>
        )}

        {((mode === 'local' && phase === 'setup') || (mode === 'online' && !isOnlineGame)) && (
          <div className="mode-switch">
            <button
              type="button"
              className={mode === 'local' ? 'active' : ''}
              onClick={() => {
                playClickSound();
                setMode('local');
                setIsOnlineGame(false);
                setRoomId(null);
                setPlayerRole(null);
                setIsBotDisguise(false); // Reset disguise for explicit local mode
                setOpponentName('AI');   // Explicit AI name
                dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE });
              }}
            >
              Local (vs AI)
            </button>
            <button
              type="button"
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
          isAutoPlay={isAutoPlay}
          onToggleAuto={() => setIsAutoPlay(!isAutoPlay)}
        />
      )}

      {/* Main Content Area */}
      {!showDiceAnimation && (
        <>
          {mode === 'online' && isQuickMatch ? (
            <div className="setup-screen">
              <div className="waiting-message">
                <h3>Quick Match</h3>
                <h2>Waiting for opponent...</h2>
                <div className="loading-spinner"></div>
                <p>Your game will start automatically when an opponent joins</p>
                <button type="button" className="btn-cancel" onClick={handleCancelMatchmaking}>
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
              onBack={() => {
                setMode('local');
                setIsOnlineGame(false);
                setIsQuickMatch(false);
              }}
            />
          ) : (
            <>
              {/* Auth Modal */}


              {/* Turn Timer Conditionally Rendered - ONLY during playing */}
              {(phase === 'playing') && (
                <div className="game-status-bar">
                  <TurnTimer
                    timeLeft={timeLeft}
                    currentPlayerIndex={currentPlayerIndex}
                    isMyTurn={
                      (isOnlineGame && playerRole === 'host' && currentPlayerIndex === 0) ||
                      (isOnlineGame && playerRole === 'guest' && currentPlayerIndex === 1) ||
                      (mode === 'local' && currentPlayerIndex === 0)
                    }
                    onResync={playerRole === 'guest' ? () => {
                      if (isOnlineGame && roomIdRef.current) {
                        playClickSound();
                        socket.emit('request_sync', { roomId: roomIdRef.current });
                      }
                    } : undefined}
                  />
                </div>
              )}
              <main className="game-board">
                {phase === 'setup' && (
                  <div className="setup-screen">
                    {isQuickMatch ? (
                      <div className="waiting-message">
                        <h3>Quick Match</h3>
                        <h2>Waiting for opponent...</h2>
                        <div className="loading-spinner"></div>
                        <p>Your game will start automatically when an opponent joins</p>
                        <button type="button" className="btn-cancel" onClick={handleCancelMatchmaking}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="lobby-home">
                        <div className="home-player-bar">
                          <div className="home-player-copy">
                            <span className="home-eyebrow">PLAYER</span>
                            <strong>{playerName || 'Guest'}</strong>
                            <span className="home-player-id">
                              {session ? `ID ${session.user.id.slice(0, 8)}` : 'Local guest'}
                            </span>
                          </div>
                          <div className="home-rating" aria-label={`Rating ${myRating || 1500}`}>
                            <span>RATING</span>
                            <strong>{myRating || 1500}</strong>
                          </div>
                        </div>

                        <section className="home-intro" aria-labelledby="home-title">
                          <span className="home-kicker">CARD + DICE STRATEGY</span>
                          <h2 id="home-title">XY Poker</h2>
                          <p>Build five poker hands across a shared line of dice. Every placement matters.</p>
                          <div className="home-meta" aria-label="Game overview">
                            <span>2 players</span>
                            <span>5 columns</span>
                            <span>Quick matches</span>
                          </div>
                        </section>

                        <div className="lobby-actions-panel">
                          <button
                            type="button"
                            className="quest-btn-primary"
                            onClick={() => {
                              setIsAutoPlay(false);
                              playClickSound();
                              handleStartGame();
                            }}
                          >
                            <span className="quest-tag">PLAY NOW</span>
                            <span className="quest-title">Play against AI</span>
                            <span className="quest-arrow" aria-hidden="true">→</span>
                          </button>

                          <button
                            type="button"
                            className="quest-btn-secondary"
                            onClick={() => {
                              playClickSound();
                              setMode('online');
                              setIsOnlineGame(false);
                              setIsQuickMatch(false);
                            }}
                          >
                            <span>
                              <small>PLAY WITH OTHERS</small>
                              Online match
                            </span>
                            <span aria-hidden="true">→</span>
                          </button>
                        </div>

                        <nav className="lobby-footer-tabs" aria-label="Home menu">
                          <button type="button" className="tab-item" onClick={() => {
                            playClickSound();
                            setShowSkinStore(true);
                          }}>
                            <span className="tab-index">01</span>
                            <span className="tab-label">Skins</span>
                          </button>
                          <button type="button" className="tab-item" onClick={() => {
                            playClickSound();
                            setShowRules(true);
                          }}>
                            <span className="tab-index">02</span>
                            <span className="tab-label">Rules</span>
                          </button>
                          <button type="button" className="tab-item" onClick={() => {
                            playClickSound();
                            if (session) setShowMyPage(true);
                            else setShowAuthModal(true);
                          }}>
                            <span className="tab-index">03</span>
                            <span className="tab-label">Account</span>
                          </button>
                          <button type="button" className="tab-item" onClick={() => {
                            playClickSound();
                            setShowContactModal(true);
                          }}>
                            <span className="tab-index">04</span>
                            <span className="tab-label">Feedback</span>
                          </button>
                        </nav>

                        <div className="home-support-row">
                          <a
                            className="home-support-link"
                            href="https://ofuse.me/c1b70795"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="開発者を支援（新しいタブで開く）"
                            onClick={playClickSound}
                          >
                            <span>開発者を支援</span>
                            <span aria-hidden="true">↗</span>
                          </a>
                          <div className="home-version">v09012057</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {phase === 'turn_selection' && (isTossingCoin || tossResult !== null) && (
                  <div className="turn-selection-overlay">
                    <h2>Coin toss</h2>
                    {isTossingCoin ? (
                      <div className="coin-toss-motion">
                        <div className="coin-container">
                          <div className={`coin flipping winner-${tossResult ?? 0}`}>
                            <div className="coin-front" />
                            <div className="coin-back" />
                          </div>
                        </div>
                        <p className="coin-toss-status">Choosing at random…</p>
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
                        <div className="toss-winner-text">
                          {tossResult === 0 ? (mode === 'online' && playerRole === 'guest' ? opponentName : playerName) : (mode === 'online' && playerRole === 'guest' ? playerName : opponentName)} won the toss
                        </div>
                        
                        {/* If it's my turn to choose (I won the toss) */}
                        {((mode === 'local' && tossResult === 0) || (mode === 'online' && ((playerRole === 'host' && tossResult === 0) || (playerRole === 'guest' && tossResult === 1)))) ? (
                          <div className="turn-choice-container">
                            {turnSelectionTimeLeft !== null && (
                              <div className="turn-choice-timer">
                                Choose in {turnSelectionTimeLeft}s
                              </div>
                            )}
                            <div className="turn-choice-buttons">
                              <button type="button" onClick={() => {
                                playClickSound();
                                const myIndex = mode === 'online' && playerRole === 'guest' ? 1 : 0;
                                handleChooseTurnOrder(myIndex);
                              }}>
                                Go first
                              </button>
                              <button type="button" onClick={() => {
                                playClickSound();
                                const opIndex = mode === 'online' && playerRole === 'guest' ? 0 : 1;
                                handleChooseTurnOrder(opIndex);
                              }}>
                                Go second
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
                      {/* Always render the action controls during playing phase to prevent layout height shifting */}
                      {phase === 'playing' && (
                        <div className="action-bar" style={{ minHeight: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <div className="place-controls">
                            <div className="toggle-hidden" style={{ opacity: (currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0)) ? 1 : 0.5, pointerEvents: (currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0)) ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                              <input
                                type="checkbox"
                                checked={placeHidden}
                                onChange={(e) => setPlaceHidden(e.target.checked)}
                                disabled={
                                  currentPlayerIndex !== (isOnlineGame && playerRole === 'guest' ? 1 : 0) ||
                                  !selectedCardId || 
                                  currentPlayer.hiddenCardsCount >= 3
                                }
                              />
                              <span style={{ marginLeft: '4px' }}>Face Down ({3 - currentPlayer.hiddenCardsCount} left)</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Check if it is valid for ME to see controls (My turn or Auto is on?) */}
                      {/* Actually, show Auto toggle always? Or only during my turn? */}
                      {/* Better always visible in footer if playing */}

                    </>
                  )}

                  {phase === 'scoring' && (
                    <div className="status-message">
                      Calculating Scores...
                    </div>
                  )}

                  {phase === 'ended' && !showResultsModal && (
                    <div className="end-game-controls" style={{ display: 'flex', gap: '10px' }}>
                      <button type="button" className="btn-secondary" onClick={() => {
                        playClickSound();
                        triggerShowdownSequence();
                      }}>
                        Replay Showdown
                      </button>
                      <button type="button" className="btn-primary" onClick={() => {
                        playClickSound();
                        setShowResultsModal(true);
                      }}>
                        Show Details
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => {
                        returnToLobby();
                      }}>
                        Back to Lobby
                      </button>
                    </div>
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
      <Suspense fallback={null}>
      {showRules && <RulesModal onClose={() => { playClickSound(); setShowRules(false); }} />}
      {showContactModal && (
        <ContactForm
          onClose={() => { playClickSound(); setShowContactModal(false); }}
          playerId={session?.user?.id}
        />
      )}

      {rematchInvited && (
        <div className="modal-overlay rematch-modal-overlay">
          <div className="modal-content">
            <h3>Rematch Request</h3>
            <p>Opponent wants to play again.</p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => {
                setRematchInvited(false);
              }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => {
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
      {showAuthModal && <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          // fetchElo();
        }}
      />}
      {showMyPage && dbPlayerId && <MyPage
        isOpen={showMyPage}
        onClose={() => setShowMyPage(false)}
        userId={dbPlayerId}
        isPremium={isPremium}
        onNameChange={(newName) => {
          setPlayerName(newName);
          localStorage.setItem('xypoker_playerName_v2', newName);
        }}
      />}
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
              dispatch({ type: 'SYNC_STATE', payload: INITIAL_GAME_STATE });
            }
            setShowResultsModal(false);
          }}
        />
      )}

      {showSkinStore && <SkinStore
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
      />}

      {/* Finish Animation Overlay - only during scoring */}
      {phase === 'scoring' && (
        <div className="finish-overlay">
          <h1 className="finish-text">FINISH!!</h1>
        </div>
      )}

      {/* Showdown popup overlay mounted at root to prevent transform misalignment */}
      {currentShowdownPopup && <ShowdownPopup data={currentShowdownPopup} />}
      </Suspense>
    </div>
  );
}

export default App;
