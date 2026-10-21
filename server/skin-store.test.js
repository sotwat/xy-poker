import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSkinPurchase, SKIN_CATALOG } from './skin-store.js';
test('skin purchases have fixed server prices and exclude owned items', () => {
    assert.deepEqual(selectSkinPurchase([], 'dice', 'gold'), { items:[{type:'dice',id:'gold'}],cost:300 });
    assert.throws(()=>selectSkinPurchase([{kind:'dice',skin_id:'gold'}],'dice','gold'));
    assert.throws(()=>selectSkinPurchase([],'dice','fake'));
    const ten=selectSkinPurchase([],null,null,10);
    assert.equal(ten.cost,1000);
    assert.equal(new Set(ten.items.map(s=>`${s.type}:${s.id}`)).size,10);
    const all=Object.entries(SKIN_CATALOG).flatMap(([kind,ids])=>ids.map(skin_id=>({kind,skin_id})));
    assert.throws(()=>selectSkinPurchase(all,null,null,1));
    const one=selectSkinPurchase(all.filter(s=>s.skin_id!=='gold'),null,null,10);
    assert.equal(one.cost,100);
});
