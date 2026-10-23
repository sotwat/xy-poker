import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';

const event = (socket, name) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Missing ${name}`)), 10000);
    socket.once(name, data => { clearTimeout(timeout); resolve(data); });
});
const emit = (socket, name, data) => socket.timeout(5000).emitWithAck(name, data);

test('two real sockets receive fresh seat-mapped public profiles on match and rematch', { timeout: 25000 }, async t => {
    const profiles = [
        { id: 'player-one', browser_id: '11111111-1111-4111-8111-111111111111', rating: 1500, ai_rating: 1722, games_played: 10, wins: 7, coins: 999 },
        { id: 'player-two', browser_id: '22222222-2222-4222-8222-222222222222', rating: 1680, ai_rating: 1400, games_played: 20, wins: 11, coins: 222 },
    ];
    const db = createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        res.setHeader('Content-Type', 'application/json');
        if (url.pathname.endsWith('/rpc/settle_match')) {
            let body = '';
            for await (const chunk of req) body += chunk;
            const params = JSON.parse(body);
            const profile = profiles.find(p => p.id === params.p_player);
            profile.games_played++;
            profile.wins += Number(params.p_result === 'win');
            res.end(JSON.stringify({ rating: { old: profile.rating, new: profile.rating, change: 0 } }));
        } else {
            const id = url.searchParams.get('id')?.slice(3);
            const browserId = url.searchParams.get('browser_id')?.slice(3);
            res.end(JSON.stringify(profiles.filter(p => id ? p.id === id : browserId ? p.browser_id === browserId : true)));
        }
    });
    db.listen(0, '127.0.0.1'); await once(db, 'listening');
    const portProbe = createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
    const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
    const child = spawn(process.execPath, ['server/index.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), SUPABASE_URL: `http://127.0.0.1:${db.address().port}`, SUPABASE_SERVICE_KEY: 'local-test-only', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const sockets = [];
    t.after(async () => {
        sockets.forEach(s => s.disconnect());
        if (child.exitCode === null) {
            const exited = once(child, 'exit');
            child.kill('SIGTERM');
            await exited;
        }
        await new Promise(resolve => db.close(resolve));
    });
    let serverError = '';
    child.stderr.on('data', chunk => { serverError += chunk; });
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server failed to start: ' + serverError)), 5000);
        child.stdout.on('data', chunk => { if (String(chunk).includes('listening on port')) { clearTimeout(timeout); resolve(); } });
        child.once('exit', () => { clearTimeout(timeout); reject(new Error(serverError)); });
    });
    sockets.push(io(`http://127.0.0.1:${port}`, { transports: ['websocket'] }), io(`http://127.0.0.1:${port}`, { transports: ['websocket'] }));
    await Promise.all(sockets.map(s => event(s, 'connect')));
    const [host, guest] = sockets;
    const room = await emit(host, 'create_room', { browserId: profiles[0].browser_id, playerName: 'Host' });
    assert.equal(room.success, true);
    // A saved update while the host was waiting must be reflected at matching time.
    profiles[0].rating = 1599;
    profiles[0].games_played = 12;
    const starts = sockets.map(s => event(s, 'game_start'));
    const joined = await emit(guest, 'join_room', { roomId: room.roomId, browserId: profiles[1].browser_id, playerName: 'Guest' });
    assert.equal(joined.success, true);
    const [a, b] = await Promise.all(starts);
    assert.deepEqual(a, b);
    assert.equal(a.p1Id, host.id); assert.equal(a.p2Id, guest.id);
    assert.deepEqual(a.p1Stats, { rating: 1599, aiRating: 1722, gamesPlayed: 12, wins: 7 });
    assert.deepEqual(a.p2Stats, { rating: 1680, aiRating: 1400, gamesPlayed: 20, wins: 11 });
    assert.equal(a.p1Stats.coins, undefined);
    const ended = event(guest, 'game_end_surrender');
    host.emit('surrender', { roomId: room.roomId }); await ended;
    const invited = event(guest, 'rematch_requested');
    host.emit('request_rematch', { roomId: room.roomId }); await invited;
    const restarted = sockets.map(s => event(s, 'game_start'));
    guest.emit('accept_rematch', { roomId: room.roomId });
    const [c, d] = await Promise.all(restarted);
    assert.deepEqual(c, d);
    assert.notEqual(c.matchId, a.matchId);
    assert.equal(c.p1Stats.gamesPlayed, 13);
    assert.equal(c.p2Stats.gamesPlayed, 21);
    assert.equal(c.p2Stats.wins, 12);

});
