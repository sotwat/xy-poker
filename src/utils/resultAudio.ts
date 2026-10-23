import { getAudioContext } from './sound';

const paths = { win: 'win', loss: 'loss', draw: 'reveal', reveal: 'reveal', tick: 'tick', level: 'level', unlock: 'unlock' } as const;
const buffers = new Map<string, Promise<AudioBuffer>>();
function load(name: keyof typeof paths) {
    const path = `/audio/results/${paths[name]}.wav`;
    if (!buffers.has(path)) buffers.set(path, fetch(path).then(response => {
        if (!response.ok) throw new Error(`Result audio: ${response.status}`);
        return response.arrayBuffer();
    }).then(data => getAudioContext().decodeAudioData(data)).catch(error => { buffers.delete(path); throw error; }));
    return buffers.get(path)!;
}

export function preloadResultAudio() {
    for (const name of Object.keys(paths) as (keyof typeof paths)[]) void load(name).catch(() => {});
}

export function createResultAudio() {
    const sources = new Set<AudioBufferSourceNode>();
    let cancelled = false;
    let muted = false;
    let generation = 0;
    return {
        preload: preloadResultAudio,
        mute(value: boolean) { muted = value; if (value) this.stop(); },
        play(name: keyof typeof paths, volume = 0.32, playbackRate = 1) {
            if (muted || cancelled || document.hidden) return;
            const requested = generation;
            const started = performance.now();
            void load(name).then(buffer => {
                if (muted || cancelled || generation !== requested || document.hidden || performance.now() - started > 250) return;
                const context = getAudioContext();
                if (context.state !== 'running') return;
                const source = context.createBufferSource();
                const gain = context.createGain();
                source.buffer = buffer;
                source.playbackRate.value = playbackRate;
                gain.gain.value = volume;
                source.connect(gain).connect(context.destination);
                sources.add(source);
                source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); };
                source.start();
            }).catch(() => {});
        },
        stop() { generation++; for (const source of sources) { try { source.stop(); } catch { /* Already ended. */ } } sources.clear(); },
        dispose() { cancelled = true; this.stop(); },
    };
}
