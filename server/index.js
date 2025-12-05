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
const matchmakingQueue = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

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
