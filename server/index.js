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
            if (room.players.includes(socket.id)) {
                room.players = room.players.filter(id => id !== socket.id);
                io.to(roomId).emit('player_left');
                if (room.players.length === 0) {
                    delete rooms[roomId];
                    // Remove from matchmaking queue if present
                    const queueIndex = matchmakingQueue.indexOf(roomId);
                    if (queueIndex !== -1) {
                        matchmakingQueue.splice(queueIndex, 1);
                    }
                }
            }
        }
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
