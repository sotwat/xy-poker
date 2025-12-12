// Simple sound utility using Web Audio API
// Shared AudioContext to prevent "limit reached" errors
let sharedAudioContext: AudioContext | null = null;

const getAudioContext = () => {
    if (!sharedAudioContext) {
        sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Mobile browsers often verify user interaction before resuming
    if (sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume().catch(e => console.warn('AudioContext resume failed:', e));
    }
    return sharedAudioContext;
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
