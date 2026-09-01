import { io, Socket } from 'socket.io-client';

// Connect to server
// In production (built), use Render server
// In dev, use localhost:3001
const SERVER_URL = (import.meta.env.VITE_SERVER_URL || (import.meta.env.PROD
    ? 'https://xy-poker.onrender.com'
    : 'http://localhost:3001')).replace(/\/$/, '');

export const socket: Socket = io(SERVER_URL, {
    autoConnect: false,
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

socket.on('connect_error', (err) => console.error('[Socket.IO] Connection error:', err));

export const connectSocket = (accessToken?: string) => {
    const previousToken = typeof socket.auth === 'object' && socket.auth !== null
        ? (socket.auth as { token?: string }).token
        : undefined;
    socket.auth = accessToken ? { token: accessToken } : {};

    if (socket.connected && previousToken !== accessToken) {
        socket.disconnect();
    }
    if (!socket.connected) socket.connect();
};
