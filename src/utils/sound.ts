import {
    getShowdownVoiceAssetPath,
    SHOWDOWN_HAND_TYPES,
    type ShowdownHandType,
    type ShowdownVoiceAssignment,
    type ShowdownVoiceCharacter,
} from '../logic/showdownVoice';

// Simple sound utility using Web Audio API
// Shared AudioContext to prevent "limit reached" errors
let sharedAudioContext: AudioContext | null = null;

const getAudioContext = () => {
    if (!sharedAudioContext) {
        sharedAudioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    // Mobile browsers often verify user interaction before resuming
    if (sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume().catch(e => console.warn('AudioContext resume failed:', e));
    }
    return sharedAudioContext;
};

// Robust unlocker for iOS/Mobile PWA
export const unlockAudioContext = () => {
    const events = ['touchstart', 'touchend', 'click', 'keydown'];
    const unlock = () => {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
                // Play silent buffer to force unlock
                const src = ctx.createBufferSource();
                src.buffer = ctx.createBuffer(1, 1, 22050);
                src.connect(ctx.destination);
                src.start(0);
            }).catch(e => console.warn('Unlock failed:', e));
        }
        // Cleanup listener once triggered
        events.forEach(e => document.removeEventListener(e, unlock));
    };
    events.forEach(e => document.addEventListener(e, unlock, { once: true }));
};

export const playClickSound = () => {
    try {
        const audioContext = getAudioContext();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Short click sound
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        console.warn('Audio playback not supported:', error);
    }
};

export const playCoinTossSound = () => {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.24, now);
        master.connect(ctx.destination);

        const playMetalPartial = (
            start: number,
            frequency: number,
            duration: number,
            volume: number,
            type: OscillatorType,
        ) => {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, start);
            oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.985, start + duration);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(volume, start + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            oscillator.connect(gain).connect(master);
            oscillator.start(start);
            oscillator.stop(start + duration + 0.01);
        };

        const playContactNoise = (start: number, duration: number, frequency: number, volume: number) => {
            const sampleCount = Math.ceil(ctx.sampleRate * duration);
            const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
            const samples = buffer.getChannelData(0);
            for (let index = 0; index < sampleCount; index++) {
                const decay = 1 - index / sampleCount;
                samples[index] = (Math.random() * 2 - 1) * decay;
            }

            const source = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            source.buffer = buffer;
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(frequency, start);
            filter.Q.value = 2.6;
            gain.gain.setValueAtTime(volume, start);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            source.connect(filter).connect(gain).connect(master);
            source.start(start);
            source.stop(start + duration);
        };

        // Fingernail/thumb flick and the first metallic launch ring.
        playContactNoise(now, 0.028, 2400, 0.26);
        playMetalPartial(now, 2250, 0.2, 0.22, 'triangle');
        playMetalPartial(now + 0.006, 3375, 0.15, 0.1, 'sine');

        // Brief, separated edge sounds follow the visible 650 ms coin rotations.
        const flipTimes = [0.18, 0.36, 0.53, 0.69, 0.84, 0.98];
        const flipOscillator = ctx.createOscillator();
        const flipGain = ctx.createGain();
        flipOscillator.type = 'triangle';
        flipGain.gain.setValueAtTime(0.0001, now);
        flipTimes.forEach((offset, index) => {
            const start = now + offset;
            flipOscillator.frequency.setValueAtTime(index % 2 === 0 ? 1950 : 2320, start);
            flipGain.gain.setValueAtTime(0.0001, start);
            flipGain.gain.linearRampToValueAtTime(0.075, start + 0.003);
            flipGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.034);
        });
        flipOscillator.connect(flipGain).connect(master);
        flipOscillator.start(now + flipTimes[0] - 0.01);
        flipOscillator.stop(now + flipTimes[flipTimes.length - 1] + 0.05);

        // Hard-surface landing: a small impact plus inharmonic coin-like ringing.
        const landing = now + 1.12;
        playContactNoise(landing, 0.045, 1750, 0.34);
        playMetalPartial(landing, 1860, 0.46, 0.32, 'triangle');
        playMetalPartial(landing + 0.004, 2840, 0.38, 0.17, 'sine');
        playMetalPartial(landing + 0.008, 4210, 0.28, 0.08, 'sine');

        const landingBody = ctx.createOscillator();
        const landingBodyGain = ctx.createGain();
        landingBody.type = 'sine';
        landingBody.frequency.setValueAtTime(155, landing);
        landingBody.frequency.exponentialRampToValueAtTime(72, landing + 0.12);
        landingBodyGain.gain.setValueAtTime(0.22, landing);
        landingBodyGain.gain.exponentialRampToValueAtTime(0.0001, landing + 0.13);
        landingBody.connect(landingBodyGain).connect(master);
        landingBody.start(landing);
        landingBody.stop(landing + 0.14);

        window.setTimeout(() => master.disconnect(), 1_700);
    } catch (error) {
        console.warn('Audio playback not supported:', error);
    }
};

export const playSuccessSound = () => {
    try {
        const audioContext = getAudioContext();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Success sound (High C -> E)
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.linearRampToValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.warn('Audio playback not supported:', error);
    }
};

export const playShowdownStinger = (isFinalHand = false) => {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.22, now);
        master.connect(ctx.destination);

        // A short upward sweep supplies the cut-in motion without loading audio assets.
        const sweep = ctx.createOscillator();
        const sweepFilter = ctx.createBiquadFilter();
        const sweepGain = ctx.createGain();
        sweep.type = 'sawtooth';
        sweep.frequency.setValueAtTime(110, now);
        sweep.frequency.exponentialRampToValueAtTime(isFinalHand ? 2100 : 1450, now + 0.28);
        sweepFilter.type = 'bandpass';
        sweepFilter.frequency.setValueAtTime(520, now);
        sweepFilter.frequency.exponentialRampToValueAtTime(2600, now + 0.28);
        sweepFilter.Q.value = 1.4;
        sweepGain.gain.setValueAtTime(0.0001, now);
        sweepGain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
        sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
        sweep.connect(sweepFilter).connect(sweepGain).connect(master);
        sweep.start(now);
        sweep.stop(now + 0.36);

        // A compact sub hit gives the title cut-in weight.
        const impact = ctx.createOscillator();
        const impactGain = ctx.createGain();
        impact.type = 'sine';
        impact.frequency.setValueAtTime(isFinalHand ? 145 : 118, now + 0.28);
        impact.frequency.exponentialRampToValueAtTime(42, now + 0.64);
        impactGain.gain.setValueAtTime(0.0001, now);
        impactGain.gain.setValueAtTime(0.72, now + 0.28);
        impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        impact.connect(impactGain).connect(master);
        impact.start(now + 0.28);
        impact.stop(now + 0.72);

        // Pachinko-like metallic pings; finite oscillators keep CPU use predictable.
        const chimeFrequencies = isFinalHand
            ? [880, 1174.66, 1567.98, 2093]
            : [784, 1046.5, 1567.98];

        chimeFrequencies.forEach((frequency, index) => {
            const chime = ctx.createOscillator();
            const chimeGain = ctx.createGain();
            const start = now + 0.34 + index * 0.055;
            chime.type = index % 2 === 0 ? 'triangle' : 'sine';
            chime.frequency.setValueAtTime(frequency, start);
            chime.frequency.exponentialRampToValueAtTime(frequency * 1.04, start + 0.22);
            chimeGain.gain.setValueAtTime(0.0001, start);
            chimeGain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
            chimeGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.52);
            chime.connect(chimeGain).connect(master);
            chime.start(start);
            chime.stop(start + 0.54);
        });

        window.setTimeout(() => master.disconnect(), 1_200);
    } catch (error) {
        console.warn('Showdown sound playback failed:', error);
    }
};

const showdownVoiceBuffers = new Map<string, Promise<AudioBuffer>>();
let activeShowdownVoice: AudioBufferSourceNode | null = null;

function loadShowdownVoice(character: ShowdownVoiceCharacter, handType: ShowdownHandType): Promise<AudioBuffer> {
    const path = getShowdownVoiceAssetPath(character, handType);
    const cached = showdownVoiceBuffers.get(path);
    if (cached) return cached;

    const loading = fetch(path)
        .then(response => {
            if (!response.ok) throw new Error(`Unable to load ${path}: ${response.status}`);
            return response.arrayBuffer();
        })
        .then(buffer => getAudioContext().decodeAudioData(buffer))
        .catch(error => {
            showdownVoiceBuffers.delete(path);
            throw error;
        });
    showdownVoiceBuffers.set(path, loading);
    return loading;
}

export function preloadShowdownVoices(assignment: ShowdownVoiceAssignment): void {
    const selectedCharacters = [assignment.p1, assignment.p2];
    for (const character of selectedCharacters) {
        for (const handType of SHOWDOWN_HAND_TYPES) {
            void loadShowdownVoice(character, handType).catch(error => {
                console.warn('Showdown voice preload failed:', error);
            });
        }
    }
}

export function stopShowdownVoice(): void {
    if (!activeShowdownVoice) return;
    try {
        activeShowdownVoice.stop();
    } catch {
        // The source may already have completed naturally.
    }
    activeShowdownVoice = null;
}

export async function playShowdownVoice(
    character: ShowdownVoiceCharacter,
    handType: ShowdownHandType,
): Promise<void> {
    try {
        const buffer = await loadShowdownVoice(character, handType);
        const context = getAudioContext();
        await context.resume();
        stopShowdownVoice();

        await new Promise<void>(resolve => {
            const source = context.createBufferSource();
            const gain = context.createGain();
            let resolved = false;
            const finish = () => {
                if (resolved) return;
                resolved = true;
                if (activeShowdownVoice === source) activeShowdownVoice = null;
                resolve();
            };

            source.buffer = buffer;
            gain.gain.value = 0.9;
            source.connect(gain).connect(context.destination);
            source.onended = finish;
            activeShowdownVoice = source;
            source.start();
            window.setTimeout(finish, Math.ceil(buffer.duration * 1000) + 500);
        });
    } catch (error) {
        console.warn('Showdown voice playback failed:', error);
    }
}

// Helper to get voices robustly
let cachedVoices: SpeechSynthesisVoice[] = [];

const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        cachedVoices = voices;
    }
};

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices(); // Init
}

export const speakText = (text: string): Promise<void> => {
    return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) {
            resolve();
            return;
        }
        try {
            // Cancel any pending speech
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);

            // Ensure voices are loaded
            if (cachedVoices.length === 0) {
                cachedVoices = window.speechSynthesis.getVoices();
            }

            const isJapanese = /[\u3040-\u30ff\u3400-\u9fff]/u.test(text);
            const speechLanguage = isJapanese ? 'ja-JP' : 'en-US';
            const voice = isJapanese
                ? cachedVoices.find(v => v.lang === 'ja-JP') || cachedVoices.find(v => v.lang.startsWith('ja'))
                : cachedVoices.find(v => v.name === 'Google US English') ||
                    cachedVoices.find(v => v.name === 'Samantha') ||
                    cachedVoices.find(v => v.lang === 'en-US' && v.name.includes('Female')) ||
                    cachedVoices.find(v => v.lang === 'en-US') ||
                    cachedVoices.find(v => v.lang.startsWith('en'));

            if (voice) {
                utterance.voice = voice;
            }

            utterance.lang = speechLanguage;
            // Natural, clear pacing
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 0.8;

            // Resolve promise when speech ends or errors out
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();

            // Safety timeout in case onend doesn't fire
            setTimeout(resolve, 3000);

            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.warn('Speech synthesis failed:', e);
            resolve();
        }
    });
};

export const warmupAudio = () => {
    // 1. Resume AudioContext
    getAudioContext();

    // 2. Unlock SpeechSynthesis (especially for iOS)
    if ('speechSynthesis' in window) {
        // Just resume/cancel to wake it up, or play silent
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
        // Some browsers need an actual speak call to unlock
        // But we don't want to interrupt if something is playing?
        // Actually, playing an empty string is a common hack.
        // However, if we do this on EVERY click, it might cancel currently playing speech.
        // We really only need to do this ONCE.
        // Let's implement a 'hasWarmedUp' flag.
    }
};


export const playGachaSoundSequence = () => {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;

        // 1. SUMMON (0s - 2s)
        // Deep Drone + LFO pulsing
        const droneOsc = ctx.createOscillator();
        const droneGain = ctx.createGain();
        droneOsc.connect(droneGain);
        droneGain.connect(ctx.destination);

        droneOsc.type = 'sawtooth';
        droneOsc.frequency.value = 50; // Low Freq

        // LFO for throbbing effect
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 5; // 5Hz wobble
        lfo.connect(lfoGain);
        lfoGain.connect(droneGain.gain);
        lfo.start(t);
        lfoGain.gain.value = 0.3; // Depth

        droneGain.gain.setValueAtTime(0, t);
        droneGain.gain.linearRampToValueAtTime(0.2, t + 0.5);
        droneGain.gain.linearRampToValueAtTime(0, t + 2.0); // Fade out as charge starts

        droneOsc.start(t);
        droneOsc.stop(t + 2.0);


        // 2. CHARGE (1.5s - 3.5s)
        // Riser: Pitch goes up, Volume goes up, Tremolo speeds up
        const chargeOsc = ctx.createOscillator();
        const chargeGain = ctx.createGain();
        chargeOsc.connect(chargeGain);
        chargeGain.connect(ctx.destination);

        chargeOsc.type = 'square';
        chargeOsc.frequency.setValueAtTime(100, t + 1.5);
        chargeOsc.frequency.exponentialRampToValueAtTime(800, t + 3.5); // Rising pitch

        chargeGain.gain.setValueAtTime(0, t + 1.5);
        chargeGain.gain.linearRampToValueAtTime(0.3, t + 3.5);
        chargeGain.gain.setValueAtTime(0, t + 3.6); // Cut

        chargeOsc.start(t + 1.5);
        chargeOsc.stop(t + 3.6);


        // 3. EXPLOSION (3.5s)
        // Burst of noise + Sub Kick
        const noiseBufferSize = ctx.sampleRate * 1.0; // 1 sec
        const noiseBuffer = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        const noisesrc = ctx.createBufferSource();
        noisesrc.buffer = noiseBuffer;
        const noiseGain = ctx.createGain();
        noisesrc.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        noiseGain.gain.setValueAtTime(1.0, t + 3.5);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 4.5);
        noisesrc.start(t + 3.5);

        // Sub Kick
        const kickOsc = ctx.createOscillator();
        const kickGain = ctx.createGain();
        kickOsc.connect(kickGain);
        kickGain.connect(ctx.destination);
        kickOsc.frequency.setValueAtTime(150, t + 3.5);
        kickOsc.frequency.exponentialRampToValueAtTime(0.01, t + 4.0);
        kickGain.gain.setValueAtTime(1.0, t + 3.5);
        kickGain.gain.exponentialRampToValueAtTime(0.01, t + 4.0);
        kickOsc.start(t + 3.5);
        kickOsc.stop(t + 4.0);


        // 4. REVEAL (3.8s)
        // Celestial Chord: Major 9th (Root, 3rd, 5th, 9th)
        // C Major: C4, E4, G4, D5
        const freqs = [523.25, 659.25, 783.99, 1174.66]; // C5, E5, G5, D6
        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.connect(g);
            g.connect(ctx.destination);

            osc.type = 'triangle'; // Smooth tone
            osc.frequency.value = f;

            // Staggered entry slightly
            const start = t + 3.8 + (i * 0.05);
            g.gain.setValueAtTime(0, start);
            g.gain.linearRampToValueAtTime(0.15, start + 0.1);
            g.gain.exponentialRampToValueAtTime(0.001, start + 4.0); // Long tail

            osc.start(start);
            osc.stop(start + 4.0);
        });

    } catch (e) {
        console.warn('Gacha sound failed:', e);
    }
};

let hasWarmedUpSpeech = false;
export const initSpeech = () => {
    if (hasWarmedUpSpeech || !('speechSynthesis' in window)) return;

    try {
        const utterance = new SpeechSynthesisUtterance('');
        utterance.volume = 0;
        window.speechSynthesis.speak(utterance);
        hasWarmedUpSpeech = true;
    } catch (e) {
        console.warn('Speech init failed:', e);
    }
};

export const playTickSound = () => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain).connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  } catch (error) {
    console.warn('Audio playback not supported:', error);
  }
};
