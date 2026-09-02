import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import supabase from './db.js';
import {
    calculateUpdatedAiParams,
    createGameRecordTrainingMetadata,
    createDeck,
    generateRoomId,
    generateSessionToken,
    isValidBrowserId,
    isValidGameAction,
    isValidGameRecord,
    normalizeRoomId,
    randomPlayerIndex,
    rollDice,
    sanitizePlayerName,
    shuffleDeck,
} from './game-utils.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const port = Number.parseInt(process.env.PORT || '3001', 10);
const defaultOrigins = [
    'https://xy-poker.pages.dev',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
];
const allowedOrigins = new Set([
    ...defaultOrigins,
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean),
]);

app.disable('x-powered-by');
app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (request.secure) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});
app.use(express.static(path.join(directory, '../dist'), {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
}));

app.get('/api/health', async (_request, response) => {
    try {
        const { error } = await supabase.from('players').select('id').limit(1);
        if (error) throw error;
        response.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('Health check failed:', error);
        response.status(503).json({ status: 'error' });
    }
});

const io = new Server(httpServer, {
    cors: {
        origin(origin, callback) {
            callback(null, !origin || allowedOrigins.has(origin));
        },
        methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 100_000,
    pingTimeout: 20_000,
    pingInterval: 25_000,
});

const rooms = new Map();
const games = new Map();
const matchmakingQueue = [];
const recentStatUpdates = new Map();
const recentAiUpdates = new Map();
const RUNTIME_AI_POLICY_ID = 'xy-gto-a7';
const RUNTIME_AI_THINK_TIME_MS = 1_000;

function acknowledge(callback, payload) {
    if (typeof callback === 'function') callback(payload);
}

function getUniqueRoomId() {
    let roomId = generateRoomId();
    while (rooms.has(roomId)) roomId = generateRoomId();
    return roomId;
}

function getRoomForSocket(socket, rawRoomId) {
    const roomId = normalizeRoomId(rawRoomId);
    const room = roomId ? rooms.get(roomId) : null;
    if (!room || !room.players.some(player => player.id === socket.id)) return null;
    return { roomId, room };
}

function isAuthorizedUser(socket, userId) {
    return !userId || socket.data.userId === userId;
}

function removeRoomFromQueue(roomId) {
    let index = matchmakingQueue.indexOf(roomId);
    while (index !== -1) {
        matchmakingQueue.splice(index, 1);
        index = matchmakingQueue.indexOf(roomId);
    }
}

function removeSocketFromRoom(socket, rawRoomId, notify = true) {
    const membership = getRoomForSocket(socket, rawRoomId);
    if (!membership) return false;

    const { roomId, room } = membership;
    room.players = room.players.filter(player => player.id !== socket.id);
    socket.leave(roomId);
    if (notify) socket.to(roomId).emit('player_left');
    removeRoomFromQueue(roomId);

    const gameStarted = games.has(roomId);
    if (room.players.length === 0 || gameStarted) {
        rooms.delete(roomId);
        games.delete(roomId);
        for (const player of room.players) io.sockets.sockets.get(player.id)?.leave(roomId);
    } else {
        rooms.set(roomId, room);
    }
    return true;
}

async function getOrCreatePlayer(browserId, userId) {
    if (userId) {
        const { data, error } = await supabase.from('players').select('*').eq('id', userId).maybeSingle();
        if (error) throw error;
        if (data) return data;
    }

    if (!isValidBrowserId(browserId)) throw new Error('Invalid browser ID');
    const { data: browserPlayer, error: browserError } = await supabase
        .from('players')
        .select('*')
        .eq('browser_id', browserId)
        .maybeSingle();
    if (browserError) throw browserError;
    if (browserPlayer) return browserPlayer;

    const { data, error } = await supabase
        .from('players')
        .insert({ browser_id: browserId, rating: 1500, ...(userId ? { id: userId } : {}) })
        .select()
        .single();
    if (error) throw error;
    return data;
}

function toRoomPlayer(socket, player, playerName) {
    return {
        id: socket.id,
        name: sanitizePlayerName(playerName),
        browserId: player.browser_id,
        dbId: player.id,
        rating: Number(player.rating) || 1500,
        isPremium: Boolean(player.is_premium),
    };
}

function startGame(roomId, room) {
    if (room.players.length !== 2) return;
    const [p1, p2] = room.players;
    const isRanked = Boolean(room.isQuickMatch);
    const startingPlayer = randomPlayerIndex();
    const initialDeck = shuffleDeck(createDeck());

    games.set(roomId, {
        isRanked,
        processed: false,
        processing: false,
        p1DbId: p1.dbId,
        p2DbId: p2.dbId,
        p1SocketId: p1.id,
        choiceOwnerIndex: startingPlayer,
        currentPlayerIndex: null,
        placementCount: 0,
        playerPlacementCounts: [0, 0],
        columnCounts: [Array(5).fill(0), Array(5).fill(0)],
        hiddenColumnCounts: [Array(5).fill(0), Array(5).fill(0)],
        hiddenTotals: [0, 0],
        hands: [
            new Set(initialDeck.slice(0, 4).map(card => card.id)),
            new Set(initialDeck.slice(4, 8).map(card => card.id)),
        ],
        remainingDeck: initialDeck.slice(8),
    });

    io.to(roomId).emit('game_start', {
        roomId,
        p1Name: p1.name,
        p2Name: p2.name,
        p1Rating: p1.rating,
        p2Rating: p2.rating,
        p1Id: p1.id,
        p2Id: p2.id,
        initialDice: rollDice(),
        initialDeck,
        startingPlayer,
        p1IsPremium: p1.isPremium,
        p2IsPremium: p2.isPremium,
        isRanked,
    });
}

function drawServerCard(game, playerIndex) {
    const card = game.remainingDeck.shift();
    if (card) game.hands[playerIndex].add(card.id);
}

function validateAndApplyGameAction(socket, membership, action) {
    const game = games.get(membership.roomId);
    if (!game) return false;

    if (action.type === 'CHOOSE_TURN_ORDER') {
        const chooser = membership.room.players[game.choiceOwnerIndex];
        if (game.currentPlayerIndex !== null || chooser?.id !== socket.id) return false;
        game.currentPlayerIndex = action.payload.startingPlayer;
        return true;
    }

    if (game.currentPlayerIndex === null || game.placementCount >= 30) return false;
    const playerIndex = membership.room.players.findIndex(player => player.id === socket.id);
    if (playerIndex !== game.currentPlayerIndex) return false;

    const { cardId, colIndex, isHidden } = action.payload;
    if (!game.hands[playerIndex].has(cardId) || game.columnCounts[playerIndex][colIndex] >= 3) return false;
    if (isHidden && (game.hiddenTotals[playerIndex] >= 3 || game.hiddenColumnCounts[playerIndex][colIndex] >= 2)) {
        return false;
    }

    game.hands[playerIndex].delete(cardId);
    game.columnCounts[playerIndex][colIndex] += 1;
    game.playerPlacementCounts[playerIndex] += 1;
    game.placementCount += 1;
    if (isHidden) {
        game.hiddenTotals[playerIndex] += 1;
        game.hiddenColumnCounts[playerIndex][colIndex] += 1;
    }

    if (game.columnCounts[playerIndex][colIndex] === 3
        && game.columnCounts[playerIndex === 0 ? 1 : 0][colIndex] < 3) {
        drawServerCard(game, playerIndex);
    }
    drawServerCard(game, playerIndex);

    let nextPlayerIndex = playerIndex === 0 ? 1 : 0;
    if (game.playerPlacementCounts[nextPlayerIndex] >= 15 && game.playerPlacementCounts[playerIndex] < 15) {
        nextPlayerIndex = playerIndex;
    }
    game.currentPlayerIndex = nextPlayerIndex;
    return true;
}

async function processRankedResult(roomId, winner) {
    const room = rooms.get(roomId);
    const game = games.get(roomId);
    if (!room || room.players.length !== 2 || !game?.isRanked || game.processed || game.processing) return false;
    if (!['p1', 'p2', 'draw'].includes(winner)) return false;

    game.processing = true;
    try {
        const { data, error } = await supabase.rpc('record_ranked_result', {
            p_player_one: game.p1DbId,
            p_player_two: game.p2DbId,
            p_winner: winner,
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (!result) throw new Error('Rating transaction returned no result');

        room.players[0].rating = result.p1_new;
        room.players[1].rating = result.p2_new;

        game.processed = true;
        io.to(roomId).emit('rating_update', {
            p1: { old: result.p1_old, new: result.p1_new, change: result.p1_change },
            p2: { old: result.p2_old, new: result.p2_new, change: result.p2_change },
        });
        return true;
    } finally {
        game.processing = false;
    }
}

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (typeof token === 'string' && token.length > 0) {
            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (error || !user) return next(new Error('Invalid authentication token'));
            socket.data.userId = user.id;
        }
        return next();
    } catch {
        return next(new Error('Authentication failed'));
    }
});

io.on('connection', socket => {
    socket.data.rateWindowStartedAt = Date.now();
    socket.data.rateEventCount = 0;

    socket.use((_packet, next) => {
        const now = Date.now();
        if (now - socket.data.rateWindowStartedAt >= 10_000) {
            socket.data.rateWindowStartedAt = now;
            socket.data.rateEventCount = 0;
        }
        socket.data.rateEventCount += 1;
        if (socket.data.rateEventCount > 100) return next(new Error('Rate limit exceeded'));
        return next();
    });

    socket.on('get_player_data', async ({ browserId, userId } = {}) => {
        try {
            if (!isAuthorizedUser(socket, userId)) throw new Error('Unauthorized');
            const player = await getOrCreatePlayer(browserId, userId);
            socket.emit('player_data', { rating: Number(player.rating) || 1500 });
        } catch (error) {
            console.error('Unable to fetch player data:', error);
            socket.emit('player_data_error', { message: 'Unable to fetch player data' });
        }
    });

    socket.on('update_username', async ({ username } = {}, callback) => {
        try {
            const userId = socket.data.userId;
            if (!userId) throw new Error('Authentication required');
            const safeUsername = sanitizePlayerName(username);
            const { error } = await supabase.from('players').update({ username: safeUsername }).eq('id', userId);
            if (error) throw error;
            acknowledge(callback, { success: true, username: safeUsername });
        } catch (error) {
            console.error('Unable to update username:', error);
            acknowledge(callback, { success: false, error: 'Unable to update username' });
        }
    });

    socket.on('save_game_record', async ({ record } = {}, callback) => {
        try {
            const userId = socket.data.userId;
            if (!userId) throw new Error('Authentication required');
            if (record && typeof record === 'object' && 'trainingMetadata' in record) {
                throw new Error('Training metadata must be server generated');
            }
            if (!isValidGameRecord(record)) throw new Error('Invalid game record');
            const hasProThoughts = record.schemaVersion === 3 && record.moves.some(move => Boolean(move.thought));
            const { data: player, error: playerError } = await supabase
                .from('players')
                .select('is_premium')
                .eq('id', userId)
                .single();
            if (playerError || !player) throw new Error('Player profile unavailable');
            if (hasProThoughts && !player.is_premium) throw new Error('PRO membership required for thought notes');

            const storedRecord = {
                ...record,
                trainingMetadata: createGameRecordTrainingMetadata(record.mode === 'bot' ? {
                    aiPolicyId: RUNTIME_AI_POLICY_ID,
                    aiThinkTimeMs: RUNTIME_AI_THINK_TIME_MS,
                } : {}),
            };
            if (JSON.stringify(storedRecord).length > 25_000) throw new Error('Enriched game record too large');

            const viewerWinner = record.winner === 'draw'
                ? 'draw'
                : record.winner === `p${record.viewerPlayerIndex + 1}` ? 'win' : 'loss';
            const opponentIndex = record.viewerPlayerIndex === 0 ? 1 : 0;
            const { error } = await supabase.from('game_records').upsert({
                id: record.id,
                player_id: userId,
                played_at: record.completedAt,
                mode: record.mode,
                result: viewerWinner,
                opponent_name: record.playerNames[opponentIndex],
                record_data: storedRecord,
            }, { onConflict: 'id', ignoreDuplicates: true });
            if (error) throw error;
            acknowledge(callback, { success: true, id: record.id });
        } catch (error) {
            console.error('Unable to save game record:', error);
            acknowledge(callback, { success: false, error: 'Unable to save game record' });
        }
    });

    socket.on('submit_contact', async ({ category, contactInfo, deviceInfo, message } = {}, callback) => {
        try {
            if (!['request', 'bug', 'other'].includes(category)) throw new Error('Invalid category');
            if (typeof message !== 'string' || message.trim().length < 1 || message.trim().length > 2_000) {
                throw new Error('Invalid message');
            }
            if (typeof contactInfo !== 'string' || contactInfo.length > 120) throw new Error('Invalid contact');
            if (typeof deviceInfo !== 'string' || deviceInfo.length > 200) throw new Error('Invalid device info');
            if (Date.now() - (socket.data.lastContactAt || 0) < 60_000) throw new Error('Contact rate limit exceeded');

            const userContact = contactInfo.trim()
                || (socket.data.userId ? `User:${socket.data.userId}` : 'Anonymous');
            const body = deviceInfo.trim() ? `[Device: ${deviceInfo.trim()}]\n\n${message.trim()}` : message.trim();
            const { error } = await supabase.from('contact_messages').insert({
                category,
                user_contact: userContact,
                message: body,
            });
            if (error) throw error;
            socket.data.lastContactAt = Date.now();
            acknowledge(callback, { success: true });
        } catch (error) {
            console.error('Unable to submit contact message:', error);
            acknowledge(callback, { success: false, error: 'Unable to send message' });
        }
    });

    socket.on('start_local_game', (_payload, callback) => {
        if (!socket.data.userId) return acknowledge(callback, { success: false, error: 'Authentication required' });
        const token = generateSessionToken();
        socket.data.localGame = {
            token,
            startedAt: Date.now(),
            statsRecorded: false,
            aiRecorded: false,
        };
        acknowledge(callback, { success: true, token });
    });

    socket.on('create_room', async ({ playerName, browserId, userId } = {}, callback) => {
        try {
            if (!isAuthorizedUser(socket, userId)) throw new Error('Unauthorized');
            const player = await getOrCreatePlayer(browserId, userId);
            const roomId = getUniqueRoomId();
            const room = { players: [toRoomPlayer(socket, player, playerName)], isQuickMatch: false };
            rooms.set(roomId, room);
            await socket.join(roomId);
            acknowledge(callback, { success: true, roomId, role: 'host' });
        } catch (error) {
            console.error('Unable to create room:', error);
            acknowledge(callback, { success: false, message: 'Unable to create room' });
        }
    });

    socket.on('join_room', async ({ roomId: rawRoomId, playerName, browserId, userId } = {}, callback) => {
        try {
            if (!isAuthorizedUser(socket, userId)) throw new Error('Unauthorized');
            const roomId = normalizeRoomId(rawRoomId);
            const room = roomId ? rooms.get(roomId) : null;
            if (!room || room.players.length !== 1 || room.players[0].id === socket.id) {
                return acknowledge(callback, { success: false, message: 'Room not found or unavailable' });
            }

            const player = await getOrCreatePlayer(browserId, userId);
            const guest = toRoomPlayer(socket, player, playerName);
            room.players.push(guest);
            await socket.join(roomId);
            const host = room.players[0];
            acknowledge(callback, { success: true, roomId, role: 'guest', opponentName: host.name });
            io.to(host.id).emit('player_joined', { roomId, role: 'host', opponentName: guest.name });
            startGame(roomId, room);
        } catch (error) {
            console.error('Unable to join room:', error);
            acknowledge(callback, { success: false, message: 'Unable to join room' });
        }
    });

    socket.on('quick_match', async ({ playerName, browserId, userId } = {}, callback) => {
        try {
            if (!isAuthorizedUser(socket, userId)) throw new Error('Unauthorized');
            const player = await getOrCreatePlayer(browserId, userId);
            const roomPlayer = toRoomPlayer(socket, player, playerName);

            let waitingRoomId = null;
            let waitingRoom = null;
            while (matchmakingQueue.length > 0 && !waitingRoom) {
                const candidateId = matchmakingQueue.shift();
                const candidate = rooms.get(candidateId);
                if (candidate?.isQuickMatch && candidate.players.length === 1 && candidate.players[0].id !== socket.id) {
                    waitingRoomId = candidateId;
                    waitingRoom = candidate;
                }
            }

            if (waitingRoom && waitingRoomId) {
                waitingRoom.players.push(roomPlayer);
                await socket.join(waitingRoomId);
                const host = waitingRoom.players[0];
                acknowledge(callback, { success: true, roomId: waitingRoomId, role: 'guest', opponentName: host.name });
                io.to(host.id).emit('opponent_joined', { name: roomPlayer.name });
                startGame(waitingRoomId, waitingRoom);
                return;
            }

            const roomId = getUniqueRoomId();
            rooms.set(roomId, { players: [roomPlayer], isQuickMatch: true });
            matchmakingQueue.push(roomId);
            await socket.join(roomId);
            acknowledge(callback, { success: true, roomId, role: 'host', waiting: true });
        } catch (error) {
            console.error('Unable to join quick match:', error);
            acknowledge(callback, { success: false, message: 'Unable to start matchmaking' });
        }
    });

    socket.on('cancel_matchmaking', ({ roomId } = {}, callback) => {
        const removed = removeSocketFromRoom(socket, roomId, false);
        acknowledge(callback, { success: removed });
    });

    socket.on('leave_room', ({ roomId } = {}) => {
        removeSocketFromRoom(socket, roomId);
    });

    socket.on('deduct_coins', async ({ amount, browserId, userId } = {}, callback) => {
        try {
            if (!userId || !isAuthorizedUser(socket, userId)) throw new Error('Unauthorized');
            if (!Number.isInteger(amount) || amount < 100 || amount > 1000) throw new Error('Invalid amount');
            const player = await getOrCreatePlayer(browserId, userId);
            const currentCoins = Number(player.coins) || 0;
            if (currentCoins < amount) return acknowledge(callback, { success: false, error: 'Insufficient coins' });

            const newBalance = currentCoins - amount;
            const { data, error } = await supabase
                .from('players')
                .update({ coins: newBalance })
                .eq('id', player.id)
                .eq('coins', currentCoins)
                .select('coins')
                .maybeSingle();
            if (error) throw error;
            if (!data) return acknowledge(callback, { success: false, error: 'Balance changed; retry' });
            acknowledge(callback, { success: true, newBalance: data.coins });
        } catch (error) {
            console.error('Unable to deduct coins:', error);
            acknowledge(callback, { success: false, error: 'Unable to deduct coins' });
        }
    });

    socket.on('update_player_stats', async ({ userId, result, gameToken } = {}, callback) => {
        try {
            if (!userId || !isAuthorizedUser(socket, userId)) throw new Error('Unauthorized');
            if (!['win', 'loss', 'draw'].includes(result)) throw new Error('Invalid result');
            const localGame = socket.data.localGame;
            if (!localGame || localGame.token !== gameToken || localGame.statsRecorded) throw new Error('Invalid game session');
            if (Date.now() - localGame.startedAt < 30_000) throw new Error('Game finished too quickly');
            if (Date.now() - (recentStatUpdates.get(userId) || 0) < 30_000) throw new Error('Stats update too frequent');

            const reward = result === 'win' ? 30 : result === 'draw' ? 20 : 10;
            const { data, error } = await supabase.rpc('record_player_result', {
                p_player_id: userId,
                p_result: result,
                p_reward: reward,
            });
            if (error) throw error;
            const stats = Array.isArray(data) ? data[0] : data;
            if (!stats) throw new Error('Stats transaction returned no result');
            localGame.statsRecorded = true;
            recentStatUpdates.set(userId, Date.now());
            acknowledge(callback, {
                success: true,
                newLevel: stats.new_level,
                leveledUp: stats.new_level > stats.old_level,
                coinsEarned: reward,
            });
        } catch (error) {
            console.error('Unable to update player stats:', error);
            acknowledge(callback, { success: false, error: 'Unable to update stats' });
        }
    });

    socket.on('update_ai_parameters', async ({ aiWon, isDraw = false, gameToken } = {}, callback) => {
        try {
            const userId = socket.data.userId;
            if (!userId) throw new Error('Authentication required');
            if (typeof aiWon !== 'boolean' || typeof isDraw !== 'boolean') throw new Error('Invalid result');
            const localGame = socket.data.localGame;
            if (!localGame || localGame.token !== gameToken || localGame.aiRecorded) throw new Error('Invalid game session');
            if (Date.now() - localGame.startedAt < 30_000) throw new Error('Game finished too quickly');
            if (Date.now() - (recentAiUpdates.get(userId) || 0) < 30_000) throw new Error('Update too frequent');

            const { data: current, error: fetchError } = await supabase
                .from('ai_global_parameters')
                .select('*')
                .eq('id', 1)
                .single();
            if (fetchError) throw fetchError;

            const updates = calculateUpdatedAiParams(current, aiWon, isDraw);
            const { error } = await supabase.from('ai_global_parameters').update(updates).eq('id', 1);
            if (error) throw error;
            localGame.aiRecorded = true;
            recentAiUpdates.set(userId, Date.now());
            acknowledge(callback, { success: true });
        } catch (error) {
            console.error('Unable to update AI parameters:', error);
            acknowledge(callback, { success: false, error: 'Unable to update AI parameters' });
        }
    });

    socket.on('report_game_end', async ({ roomId: rawRoomId, winner } = {}) => {
        const membership = getRoomForSocket(socket, rawRoomId);
        if (!membership) return;
        const game = games.get(membership.roomId);
        if (socket.id !== game?.p1SocketId || game.placementCount !== 30) return;
        try {
            await processRankedResult(membership.roomId, winner);
        } catch (error) {
            console.error('Unable to update ratings:', error);
        }
    });

    socket.on('surrender', async ({ roomId: rawRoomId } = {}) => {
        const membership = getRoomForSocket(socket, rawRoomId);
        if (!membership || membership.room.players.length !== 2) return;
        const surrenderIndex = membership.room.players.findIndex(player => player.id === socket.id);
        const winner = surrenderIndex === 0 ? 'p2' : 'p1';
        try {
            await processRankedResult(membership.roomId, winner);
        } catch (error) {
            console.error('Unable to update surrender rating:', error);
        }
        io.to(membership.roomId).emit('game_end_surrender', { winner, surrendererId: socket.id });
    });

    socket.on('game_action', ({ roomId: rawRoomId, action } = {}) => {
        const membership = getRoomForSocket(socket, rawRoomId);
        if (!membership || !isValidGameAction(action)) return;
        if (!validateAndApplyGameAction(socket, membership, action)) return;
        socket.to(membership.roomId).emit('game_action', action);
    });

    socket.on('sync_state', ({ roomId: rawRoomId, state } = {}) => {
        const membership = getRoomForSocket(socket, rawRoomId);
        if (!membership || membership.room.players[0]?.id !== socket.id) return;
        if (!state || typeof state !== 'object' || JSON.stringify(state).length > 75_000) return;
        const game = games.get(membership.roomId);
        if (!game?.syncRequesterId || Date.now() - game.syncRequestedAt > 5_000) return;
        if (state.turnCount !== game.placementCount + 1) return;
        io.to(game.syncRequesterId).emit('sync_state', state);
        game.syncRequesterId = null;
    });

    socket.on('request_sync', ({ roomId: rawRoomId } = {}) => {
        const membership = getRoomForSocket(socket, rawRoomId);
        if (!membership || membership.room.players[0]?.id === socket.id) return;
        const game = games.get(membership.roomId);
        if (!game) return;
        game.syncRequesterId = socket.id;
        game.syncRequestedAt = Date.now();
        socket.to(membership.roomId).emit('request_sync', { requesterId: socket.id });
    });

    socket.on('request_rematch', ({ roomId: rawRoomId } = {}) => {
        const membership = getRoomForSocket(socket, rawRoomId);
        if (!membership || membership.room.players.length !== 2) return;
        const player = membership.room.players.find(candidate => candidate.id === socket.id);
        membership.room.rematchRequestedBy = socket.id;
        socket.to(membership.roomId).emit('rematch_requested', { requesterName: player?.name || 'Opponent' });
    });

    socket.on('accept_rematch', ({ roomId: rawRoomId } = {}) => {
        const membership = getRoomForSocket(socket, rawRoomId);
        if (!membership || membership.room.players.length !== 2) return;
        if (!membership.room.rematchRequestedBy || membership.room.rematchRequestedBy === socket.id) return;
        membership.room.rematchRequestedBy = null;
        startGame(membership.roomId, membership.room);
    });

    socket.on('disconnect', async () => {
        const queuedIndex = matchmakingQueue.findIndex(roomId => rooms.get(roomId)?.players[0]?.id === socket.id);
        if (queuedIndex !== -1) {
            const [roomId] = matchmakingQueue.splice(queuedIndex, 1);
            rooms.delete(roomId);
        }

        for (const [roomId, room] of [...rooms]) {
            const disconnectedIndex = room.players.findIndex(player => player.id === socket.id);
            if (disconnectedIndex === -1) continue;

            const game = games.get(roomId);
            if (game?.isRanked && room.players.length === 2 && !game.processed) {
                const winner = disconnectedIndex === 0 ? 'p2' : 'p1';
                try {
                    await processRankedResult(roomId, winner);
                } catch (error) {
                    console.error('Unable to update disconnect rating:', error);
                }
                socket.to(roomId).emit('game_end_surrender', { winner, surrendererId: socket.id });
                removeSocketFromRoom(socket, roomId, false);
            } else {
                removeSocketFromRoom(socket, roomId);
            }
        }
    });
});

httpServer.listen(port, () => {
    console.log(`XY Poker server listening on port ${port}`);
});

function shutdown(signal) {
    console.log(`Received ${signal}; closing server`);
    io.close(() => httpServer.close(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
