import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../dist')));

const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for local dev
        methods: ["GET", "POST"]
    }
});

// Store room state: { [roomId]: { players: [socketId1, socketId2], gameState: ... } }
// For simplicity, we just track players in room.
const rooms = {};

// Matchmaking queue: stores roomId of rooms waiting for second player
import supabase from './db.js';

// Elo Rating Constants
const K_FACTOR = 32;

function calculateEloChange(playerRating, opponentRating, actualScore) {
    // actualScore: 1 (win), 0.5 (draw), 0 (loss)
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    const change = Math.round(K_FACTOR * (actualScore - expectedScore));
    return change;
}

// ... (existing code for quickMatchQueue)
// We need to fetch player data when joining queue
const matchmakingQueue = []; // This was already here, but the new code implies a 'quickMatchQueue'

// Helper to get or create player
async function getOrCreatePlayer(browserId) {
    const { data: existing, error } = await supabase
        .from('players')
        .select('*')
        .eq('browser_id', browserId)
        .single();

    if (existing) return existing;

    const { data: newPlayer, error: createError } = await supabase
        .from('players')
        .insert([{ browser_id: browserId, rating: 1500 }])
        .select()
        .single();

    if (createError) {
        console.error('Error creating player:', createError);
        return null;
    }
    return newPlayer;
}

// New structure for quick match queue, using sockets directly
const quickMatchQueue = [];
const games = {}; // To store game-specific data for quick matches

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join_quick_match', async ({ browserId }) => {
        // If no browserId provided (old client), generate a random temp one or fail
        const bId = browserId || `temp_${socket.id}`;

        // Fetch player data
        const player = await getOrCreatePlayer(bId);
        if (!player) {
            socket.emit('error', 'Failed to fetch player data');
            return;
        }

        socket.browserId = bId;
        socket.rating = player.rating;

        // Add to queue
        quickMatchQueue.push(socket);
        socket.emit('quick_match_joined', { rating: player.rating });
        console.log(`User ${socket.id} (Rating: ${player.rating}) joined quick match queue. Queue size: ${quickMatchQueue.length}`);

        // Check for match
        if (quickMatchQueue.length >= 2) {
            // Simple matchmaking: just take next 2
            // In future: find closest rating
            const p1 = quickMatchQueue.shift();
            const p2 = quickMatchQueue.shift();

            if (!p1 || !p2) return; // safety

            const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            p1.join(roomId);
            p2.join(roomId);

            p1.data = { roomId, role: 'host', opponentId: p2.id };
            p2.data = { roomId, role: 'guest', opponentId: p1.id };

            // Initialize game state (REMOVED default rating, will effectively be handled in game logic if needed, but here we just manage room)
            games[roomId] = {
                gameState: {
                    // ... minimal state tracking for server if needed, mostly client-side driven currently?
                    // Wait, previous implementation relied on clients driving state? 
                    // Looking at existing code, server mainly relays actions. 
                    // But we need to track SCORE here to update ratings?
                    // Or we trust the 'game_end' event from client?
                    // Ideally server should validate, but for now we trust clients.
                    p1Rating: p1.rating,
                    p2Rating: p2.rating,
                    p1BrowserId: p1.browserId,
                    p2BrowserId: p2.browserId
                }
            };

            io.to(roomId).emit('game_start', {
                roomId,
                p1Name: `Player (R:${p1.rating})`,
                p2Name: `Player (R:${p2.rating})`,
                p1Rating: p1.rating,
                p2Rating: p2.rating
            });
        }
    });
}
    });

socket.on('get_player_data', async ({ browserId }) => {
    const player = await getOrCreatePlayer(browserId || `temp_${socket.id}`);
    if (player) {
        socket.emit('player_data', { rating: player.rating });
    }
});

// Listen for game end to update ratings
// We need a trusted way to know game ended.
// Currently clients emit 'action'.
// We'll rely on a specific 'report_result' event or hook into action relay?
// Let's modify 'action' handler to check for game end state?
// Or add a new event 'game_over_report' sent by Host?

socket.on('report_game_end', async ({ roomId, winner, p1Score, p2Score }) => {
    // Only process if sent by Host to avoid double processing
    // (Or handle idempotency)
    const room = games[roomId];
    if (!room || room.processed) return;

    if (socket.data.role !== 'host') return; // Trust Host only for now

    room.processed = true; // prevent double update

    const p1Rating = room.gameState.p1Rating;
    const p2Rating = room.gameState.p2Rating;

    // Determine actual score for P1
    // p1 wins = 1, p2 wins = 0, draw = 0.5
    let p1Actual = 0.5;
    if (winner === 'p1') p1Actual = 1;
    if (winner === 'p2') p1Actual = 0;

    const p2Actual = 1 - p1Actual;

    const p1Change = calculateEloChange(p1Rating, p2Rating, p1Actual);
    const p2Change = calculateEloChange(p2Rating, p1Rating, p2Actual);

    const newP1Rating = p1Rating + p1Change;
    const newP2Rating = p2Rating + p2Change;

    console.log(`Game Over ${roomId}: P1 (${p1Rating} -> ${newP1Rating}), P2 (${p2Rating} -> ${newP2Rating})`);

    // Update DB
    await supabase.from('players').update({ rating: newP1Rating }).eq('browser_id', room.gameState.p1BrowserId);
    await supabase.from('players').update({ rating: newP2Rating }).eq('browser_id', room.gameState.p2BrowserId);

    // Emit updates to room
    io.to(roomId).emit('rating_update', {
        p1: { old: p1Rating, new: newP1Rating, change: p1Change },
        p2: { old: p2Rating, new: newP2Rating, change: p2Change }
    });

    // Cleanup room after delay
    setTimeout(() => {
        delete games[roomId];
    }, 5000);
});

// ... existing action handlers ...

socket.on('create_room', ({ playerName }, callback) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[roomId] = { players: [{ id: socket.id, name: playerName || 'Player 1' }] };
    socket.join(roomId);
    callback({ roomId });
    console.log(`Room ${roomId} created by ${socket.id}`);
});

socket.on('join_room', ({ roomId, playerName }, callback) => {
    const room = rooms[roomId];
    if (room && room.players.length < 2) {
        room.players.push({ id: socket.id, name: playerName || 'Player 2' });
        socket.join(roomId);

        // Send opponent name to guest
        const hostName = room.players[0].name;
        callback({ success: true, opponentName: hostName });

        // Notify host that P2 joined with their name
        io.to(room.players[0].id).emit('player_joined', { playerId: socket.id, playerName: playerName || 'Player 2' });
        console.log(`User ${socket.id} joined room ${roomId}`);

        // Start game? Host can start.
    } else {
        callback({ success: false, message: 'Room not found or full' });
    }
});

socket.on('quick_match', ({ playerName }, callback) => {
    // Check if there's a room waiting for a player
    if (matchmakingQueue.length > 0) {
        // Join the first available room
        const roomId = matchmakingQueue.shift();
        const room = rooms[roomId];

        if (room && room.players.length === 1) {
            const hostName = room.players[0].name;
            const guestName = playerName || 'Player 2';

            room.players.push({ id: socket.id, name: guestName });
            socket.join(roomId);
            callback({ success: true, roomId, role: 'guest', opponentName: hostName });

            // Notify both players with opponent names and auto-start
            io.to(room.players[0].id).emit('opponent_joined', { opponentName: guestName });
            io.to(socket.id).emit('opponent_joined', { opponentName: hostName });

            // Auto-start game for quick match
            io.to(roomId).emit('auto_start_game');

            console.log(`Quick match: User ${socket.id} (${guestName}) joined ${room.players[0].id} (${hostName}) in room ${roomId}, game auto-starting`);
        } else {
            // Room became invalid, create new one
            matchmakingQueue.length = 0; // Clear invalid queue
            createMatchmakingRoom(socket, playerName, callback);
        }
    } else {
        // No rooms waiting, create new one
        createMatchmakingRoom(socket, playerName, callback);
    }
});

function createMatchmakingRoom(socket, playerName, callback) {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[roomId] = { players: [{ id: socket.id, name: playerName || 'Player 1' }], isQuickMatch: true };
    socket.join(roomId);
    matchmakingQueue.push(roomId);
    callback({ success: true, roomId, role: 'host', waiting: true });
    console.log(`Quick match room ${roomId} created by ${socket.id} (${playerName || 'Player 1'}), waiting for opponent`);
}

socket.on('cancel_matchmaking', ({ roomId }) => {
    if (roomId && rooms[roomId]) {
        // Remove player from room
        const room = rooms[roomId];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);

        if (playerIndex !== -1) {
            room.players.splice(playerIndex, 1);
            socket.leave(roomId);

            // If room is empty, delete it and remove from queue
            if (room.players.length === 0) {
                delete rooms[roomId];
                const queueIndex = matchmakingQueue.indexOf(roomId);
                if (queueIndex !== -1) {
                    matchmakingQueue.splice(queueIndex, 1);
                }
                console.log(`Room ${roomId} cancelled and deleted`);
            } else {
                // Notify remaining player
                io.to(roomId).emit('player_left');
                console.log(`Player ${socket.id} cancelled matchmaking in room ${roomId}`);
            }
        }
    }
});

socket.on('surrender', ({ roomId }) => {
    if (roomId && rooms[roomId]) {
        // Determine winner (opponent of surrendering player)
        const room = rooms[roomId];
        const surrenderIndex = room.players.findIndex(p => p.id === socket.id);

        if (surrenderIndex !== -1) {
            const winnerIndex = surrenderIndex === 0 ? 1 : 0;
            const winner = winnerIndex === 0 ? 'p1' : 'p2';

            // Notify all players in room
            io.to(roomId).emit('game_end_surrender', { winner, surrendererId: socket.id });
            console.log(`Player ${socket.id} surrendered in room ${roomId}, winner: ${winner}`);
        }
    }
});

socket.on('game_action', ({ roomId, action }) => {
    // Relay action to others in room
    socket.to(roomId).emit('game_action', action);
});

socket.on('sync_state', ({ roomId, state }) => {
    // Host sends initial state to Guest
    socket.to(roomId).emit('sync_state', state);
});

socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Cleanup rooms...
    for (const roomId in rooms) {
        const room = rooms[roomId];
        // Check if this socket is in the room (players are now objects with {id, name})
        const playerIndex = room.players.findIndex(p => p.id === socket.id);

        if (playerIndex !== -1) {
            // Remove the player
            room.players.splice(playerIndex, 1);

            // Notify remaining players
            io.to(roomId).emit('player_left');

            console.log(`Player ${socket.id} left room ${roomId}, ${room.players.length} players remaining`);

            // If room is empty, delete it
            if (room.players.length === 0) {
                delete rooms[roomId];

                // Remove from matchmaking queue if present
                const queueIndex = matchmakingQueue.indexOf(roomId);
                if (queueIndex !== -1) {
                    matchmakingQueue.splice(queueIndex, 1);
                    console.log(`Empty room ${roomId} removed from matchmaking queue`);
                }

                console.log(`Empty room ${roomId} deleted`);
            }
        }
    }
});
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
