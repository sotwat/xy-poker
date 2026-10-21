export const SKIN_CATALOG = {
    dice: ['red','blue','green','yellow','purple','black','pink','orange','teal','silver','gold'],
    card: ['red-modern','blue-modern','gold-luxury','cyber-neon','dark-matter','wood-grain','matrix','sunset','royal-purple','cool-mint','dragon-scale'],
    board: ['midnight-blue','casino-red','void-black','neon-grid','warm-wood','ice-blue','royal-gold','cyber-punk','minimal-grey','space-station','volcano'],
};

export function selectSkinPurchase(owned, kind, id, count) {
    const pool = Object.entries(SKIN_CATALOG).flatMap(([type, ids]) => ids.map(id => ({ type, id })))
        .filter(item => !owned.some(s => s.kind === item.type && s.skin_id === item.id));
    if (id) {
        const item = pool.find(s => s.type === kind && s.id === id);
        if (!item) throw new Error('Skin unavailable');
        return { items: [item], cost: 300 };
    }
    if (![1, 10].includes(count) || !pool.length) throw new Error('No skins available');
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const items = pool.slice(0, count);
    return { items, cost: items.length * 100 };
}
