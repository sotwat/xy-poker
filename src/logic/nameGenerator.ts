// Generate random player names for online multiplayer

const adjectives = [
    'Brave', 'Swift', 'Clever', 'Mighty', 'Silent',
    'Noble', 'Fierce', 'Bold', 'Wise', 'Lucky',
    'Wild', 'Sharp', 'Quick', 'Steady', 'Bright',
    'Cool', 'Epic', 'Grand', 'Strong', 'Sleek'
];

const nouns = [
    'Tiger', 'Eagle', 'Dragon', 'Wolf', 'Phoenix',
    'Falcon', 'Panther', 'Lion', 'Hawk', 'Bear',
    'Fox', 'Shark', 'Viper', 'Raven', 'Cobra',
    'Lynx', 'Puma', 'Cheetah', 'Jaguar', 'Orca'
];

export function generateRandomPlayerName(): string {
    let name = '';
    // Retry limit to prevent infinite loops
    for (let i = 0; i < 50; i++) {
        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];

        // Use Camelcase concatenation to save space
        let candidate = `${adjective}${noun}`;

        if (candidate.length <= 10) {
            // If space remains, optionally add a number
            const remaining = 10 - candidate.length;
            if (remaining >= 1 && Math.random() > 0.3) {
                // Generate a number that fits
                // e.g. remaining 2 -> max 99.
                const max = Math.pow(10, remaining) - 1;
                if (max > 0) {
                    const num = Math.floor(Math.random() * (max + 1));
                    candidate += num;
                }
            }
            name = candidate;
            break;
        }
    }

    // Fallback (guaranteed <= 10)
    if (!name) return 'Player' + Math.floor(Math.random() * 9999);

    return name;
}
