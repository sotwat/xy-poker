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
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 100);

    return `${adjective} ${noun} ${number}`;
}
