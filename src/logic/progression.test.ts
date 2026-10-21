import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ACHIEVEMENT_TYPES } from './achievements';
import { COSMETICS, achievementReward, unlockedCosmetics } from './progression';
import { SKIN_CATALOG, selectSkinPurchase } from '../../server/skin-store.js';
import { AVAILABLE_DICE_SKINS, AVAILABLE_CARD_SKINS, AVAILABLE_BOARD_SKINS } from './types';

test('earned skins are distinct from paid skins, renderable, and unobtainable from purchases', () => {
    const visuals = { dice: AVAILABLE_DICE_SKINS, card: AVAILABLE_CARD_SKINS, board: AVAILABLE_BOARD_SKINS };
    assert.equal(new Set(COSMETICS.map(c => c.id)).size, COSMETICS.length);
    for (const item of COSMETICS) {
        if (item.achievement) assert.ok((ACHIEVEMENT_TYPES as readonly string[]).includes(item.achievement));
        if (item.kind === 'title') continue;
        const kind = item.kind as keyof typeof visuals;
        assert.ok(visuals[kind].some(s => s.id === item.id));
        assert.ok(!SKIN_CATALOG[kind].includes(item.id));
        assert.throws(() => selectSkinPurchase([], kind, item.id, undefined));
    }
    assert.equal(unlockedCosmetics(1, []).length, 0);
    assert.ok(unlockedCosmetics(5, []).some(c => c.id === 'earned-copper'));
    assert.ok(unlockedCosmetics(1, ['win_streak_5']).some(c => c.id === 'earned-ember'));
    assert.ok(unlockedCosmetics(20, ['perfect_game','games_100','win_streak_5','first_win','x_win_royal_flush']).length === COSMETICS.length);
});

test('SQL and client catalogs award the same amount for every achievement and cosmetic condition', () => {
    const sql = readFileSync(new URL('../../supa_schema_v15_progression.sql', import.meta.url), 'utf8');
    for (const type of ACHIEVEMENT_TYPES) {
        const reward = achievementReward(type);
        assert.ok(reward.coins > 0 && reward.xp > 0);
        assert.ok(sql.includes(`('${type}',${reward.coins},${reward.xp})`), type);
    }
    for (const c of COSMETICS) assert.ok(sql.includes(`('${c.id}','${c.kind}','${c.name}',${c.level ?? 'NULL'},${c.achievement ? `'${c.achievement}'` : 'NULL'})`));
    assert.deepEqual(achievementReward('unrecognized'), {coins:0,xp:0});
});
