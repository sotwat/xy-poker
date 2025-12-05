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

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', (callback) => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { players: [socket.id] };
        socket.join(roomId);
        callback({ roomId });
        console.log(`Room ${roomId} created by ${socket.id}`);
    });

    socket.on('join_room', (roomId, callback) => {
        const room = rooms[roomId];
        if (room && room.players.length < 2) {
            room.players.push(socket.id);
            socket.join(roomId);
            callback({ success: true });

            // Notify host that P2 joined
            io.to(roomId).emit('player_joined', { playerId: socket.id });
            console.log(`User ${socket.id} joined room ${roomId}`);

            // Start game? Host can start.
        } else {
            callback({ success: false, message: 'Room not found or full' });
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
            if (room.players.includes(socket.id)) {
                room.players = room.players.filter(id => id !== socket.id);
                io.to(roomId).emit('player_left');
                if (room.players.length === 0) {
                    delete rooms[roomId];
                }
            }
        }
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
