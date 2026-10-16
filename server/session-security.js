// Call only after Supabase has authenticated this exact token.
export function verifiedTokenExpiry(token, now = Date.now()) {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (!Number.isFinite(payload.exp) || payload.exp * 1000 <= now) {
        throw new Error('Expired authentication token');
    }
    return payload.exp * 1000;
}

export function installSessionExpiry(socket, expiresAt, now = Date.now, schedule = setTimeout) {
    socket.use((_packet, next) => {
        if (now() >= expiresAt) {
            next(new Error('Authentication expired'));
            socket.disconnect(true);
            return;
        }
        next();
    });
    const timer = schedule(() => socket.disconnect(true), Math.max(0, Math.min(expiresAt - now(), 2_147_483_647)));
    timer.unref?.();
    socket.once('disconnect', () => clearTimeout(timer));
}
