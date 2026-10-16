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

export function createContactLimiter(now = Date.now) {
    const buckets = new Map();
    return (userId, address) => {
        const time = now();
        for (const [key, bucket] of buckets) {
            if (bucket.until <= time) buckets.delete(key);
        }
        const limits = [['global', 60], [`ip:${address || 'unknown'}`, 5]];
        if (userId) limits.push([`user:${userId}`, 1]);
        if (limits.some(([key, limit]) => (buckets.get(key)?.count || 0) >= limit)) return false;
        for (const [key] of limits) {
            const bucket = buckets.get(key) || { count: 0, until: time + 60_000 };
            bucket.count += 1;
            buckets.set(key, bucket);
        }
        return true;
    };
}
