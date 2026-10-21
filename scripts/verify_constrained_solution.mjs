import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const data=JSON.parse(readFileSync('gto_constrained_mixture_worlds_20261021.json','utf8'));
const output=JSON.parse(readFileSync('gto_constrained_mixture_solution_20261021.json','utf8'));
for(const [p,h] of Object.entries(output.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'),h);
const number=s=>{const [a,b='1']=s.split('/');return Number(a)/Number(b);};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function elimination(rows,rhs){
    const a=rows.map((row,i)=>[...row,rhs[i]]),n=rows.length;
    for(let j=0;j<n;j++){
        let p=j;for(let i=j+1;i<n;i++)if(Math.abs(a[i][j])>Math.abs(a[p][j]))p=i;
        if(Math.abs(a[p][j])<1e-10)return null;
        [a[j],a[p]]=[a[p],a[j]];
        const scale=a[j][j];for(let k=j;k<=n;k++)a[j][k]/=scale;
        for(let i=0;i<n;i++)if(i!==j){const q=a[i][j];for(let k=j;k<=n;k++)a[i][k]-=q*a[j][k];}
    }
    return a.map(row=>row[n]);
}
function vertices(m,baseline){
    const n=m.length,eq=Array(n).fill(1).concat(0),inequalities=[];
    for(let i=0;i<n;i++){const row=Array(n+1).fill(0);row[i]=-1;inequalities.push([row,0]);}
    for(let j=0;j<4;j++)inequalities.push([m.map(row=>-row[j]).concat(0),-m[baseline][j]]);
    for(let j=0;j<4;j++)inequalities.push([m.map(row=>-row[j]).concat(1),0]);
    const all=[];
    function combinations(start,chosen){
        if(chosen.length===n){
            const x=elimination([eq,...chosen.map(i=>inequalities[i][0])],[1,...chosen.map(i=>inequalities[i][1])]);
            if(x && inequalities.every(([row,b])=>row.reduce((s,v,i)=>s+v*x[i],0)<=b+1e-9))all.push(x);
            return;
        }
        for(let i=start;i<inequalities.length;i++)combinations(i+1,[...chosen,i]);
    }
    combinations(0,[]);assert.ok(all.length);
    const key=x=>[x[n],x[baseline],...x.slice(0,n)];
    all.sort((a,b)=>{const ka=key(a),kb=key(b);for(let i=0;i<ka.length;i++)if(Math.abs(ka[i]-kb[i])>1e-9)return kb[i]-ka[i];return 0;});
    return all[0];
}
const positive=vertices([[0,0,0,0],[1,-0.5,1,-0.5],[-0.5,1,-0.5,1]],0);
[0,0.5,0.5,0.25].forEach((v,i)=>near(positive[i],v));
let checked=0;const summary=[];
for(const g of data.groups){
    const strict=[];
    for(const [ri,r]of g.rows.entries()){
        const out=output.rows.find(v=>v.phase===g.phase&&v.row===ri);assert.ok(out);
        const matrices=r.batches.map(batch=>r.actions.map((_,ai)=>[0,1,2,3].map(pi=>batch.worlds.reduce((sum,w)=>{
            const win=w.arms[pi][ai].winner;return sum+(win==='draw'?0:win===`p${r.root+1}`?1:-1);
        },0)/16)));
        const [fit,test]=matrices,n=fit.length,w=out.weights.map(number),v=vertices(fit,r.baseline);
        w.forEach((value,i)=>near(value,v[i]));near(number(out.fitValue),v[n]);near(w.reduce((s,x)=>s+x,0),1);assert.ok(w.every(x=>x>=0));
        const pure=Math.max(...fit.filter(row=>row.every((x,j)=>x>=fit[r.baseline][j])).map(row=>Math.min(...row)));
        near(number(out.fitPureValue),pure);near(number(out.strictMixedGain),v[n]-pure);
        const mix=test[0].map((_,j)=>w.reduce((s,x,i)=>s+x*test[i][j],0));
        const delta=mix.map((x,j)=>x-test[r.baseline][j]);
        mix.forEach((x,j)=>near(x,number(out.heldoutMixed[j])));delta.forEach((x,j)=>near(x,number(out.heldoutDelta[j])));
        assert.deepEqual([out.deal,out.swap],[r.deal,r.swap]);
        if(r.swap===0 && v[n]-pure>1e-9)strict.push(delta);
        if(r.swap===1){const other=output.rows.find(x=>x.phase===g.phase&&x.deal===r.deal&&x.swap===0);assert.deepEqual(out.weights,other.weights);assert.deepEqual(out.heldoutDelta,other.heldoutDelta);}
        checked++;
    }
    summary.push({phase:g.phase,deals:4,strictMixedDeals:strict.length,heldoutNonworseStrictDeals:strict.filter(a=>a.every(v=>v>=-1e-9)).length,supported:strict.length>0&&strict.every(a=>a.every(v=>v>=-1e-9))&&strict.some(a=>a.some(v=>v>1e-9))});
}
assert.equal(output.rows.length,checked);assert.deepEqual(summary,output.summary);
console.log(JSON.stringify({verified:true,matrices:checked,summary}));
