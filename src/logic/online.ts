import { io, Socket } from 'socket.io-client';

// Connect to server
// In production (built), use Render server
// In dev, use localhost:3001
const SERVER_URL = import.meta.env.PROD
    ? 'https://xy-poker.onrender.com'
    : 'http://localhost:3001';

console.log('[Socket.IO] Connecting to:', SERVER_URL);

export const socket: Socket = io(SERVER_URL, {
    autoConnect: false,
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// Debug logging
socket.on('connect', () => console.log('[Socket.IO] Connected! ID:', socket.id));
socket.on('disconnect', (reason) => console.log('[Socket.IO] Disconnected. Reason:', reason));
socket.on('connect_error', (err) => console.error('[Socket.IO] Connection error:', err));
socket.on('reconnect_attempt', () => console.log('[Socket.IO] Reconnecting...'));

import { getBrowserId } from '../utils/identity';

export const joinQuickMatch = () => {
    if (socket) {
        const browserId = getBrowserId();
        socket.emit('join_quick_match', { browserId });
    }
};
export const connectSocket = () => {
    if (!socket.connected) {
        console.log('[Socket.IO] Initiating connection...');
        socket.connect();
    }
};

export const disconnectSocket = () => {
    if (socket.connected) {
        console.log('[Socket.IO] Disconnecting...');
        socket.disconnect();
    }
};
