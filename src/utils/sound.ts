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
                console.log('Audio unlocked via interaction');
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

export const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    try {
        // Cancel any pending speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // Ensure voices are loaded
        if (cachedVoices.length === 0) {
            cachedVoices = window.speechSynthesis.getVoices();
        }

        // Try to pick a consistent English voice
        // generic 'en-US' preference
        const voice = cachedVoices.find(v => v.lang === 'en-US' && !v.name.includes('Google')) ||
            cachedVoices.find(v => v.lang === 'en-US') ||
            cachedVoices.find(v => v.lang.startsWith('en'));

        if (voice) {
            utterance.voice = voice;
        }

        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;

        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn('Speech synthesis failed:', e);
    }
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
