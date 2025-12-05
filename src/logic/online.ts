import { io, Socket } from 'socket.io-client';

// Connect to server
// In production (built), use same origin as the page
// In dev, use localhost:3001
const SERVER_URL = import.meta.env.PROD
    ? (typeof window !== 'undefined' ? window.location.origin : undefined)
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
