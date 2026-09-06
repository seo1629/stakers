import test from 'node:test';
import assert from 'node:assert/strict';
import {solve,SAMPLES,DEFAULTS,fits,rectangle,polygonArea} from '../src/solver.js';
const input=(params={},polygon=[SAMPLES[0].ring])=>({polygon,params:{...DEFAULTS,...params}});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
test('all alternatives remain within parcel, setbacks and three numeric caps',()=>{
 for(const sample of SAMPLES){const i=input({},[sample.ring]),r=solve(i);assert.ok(r.alternatives.length);for(const a of r.alternatives){
  assert.ok(fits(rectangle(a.x,a.y,a.width,a.depth,a.angle),i.polygon,i.params.setback));
  assert.ok(a.footprint<=r.caps.footprint+1e-6);assert.ok(a.gfa<=r.caps.gfa+1e-6);assert.ok(a.height<=i.params.maxHeight+1e-6);assert.ok(a.levels.length<=i.params.maxFloors);
  assert.equal(a.count,a.modules.length);close(a.gfa,a.levels.reduce((s,l)=>s+l.area,0));close(a.height,a.levels.length*i.params.moduleHeight);
 }}
});
test('upper floors have only complete modules with support from floors below',()=>{
 const a=solve(input()).alternatives[0];assert.ok(a.levels.at(-1).pairs<a.levels[0].pairs);
 for(const m of a.modules){assert.equal(m.w,DEFAULTS.width);assert.equal(m.d,DEFAULTS.length);if(m.level>1)assert.ok(a.modules.some(b=>b.level===m.level-1&&b.x===m.x&&b.y===m.y));}
});
test('same-level modules and reserved common spaces do not overlap',()=>{
 const a=solve(input()).alternatives[0];const rects=[...a.modules,...a.commons];for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const x=rects[i],y=rects[j];if(x.level!==y.level)continue;const w=Math.min(x.x+x.w,y.x+y.w)-Math.max(x.x,y.x),d=Math.min(x.y+x.d,y.y+y.d)-Math.max(x.y,y.y);assert.ok(w<1e-7||d<1e-7);}
});
test('module count and unit conversion are separate',()=>{const a=solve(input({modulesPerUnit:3})).alternatives[0];assert.equal(a.units,Math.floor(a.count/3));assert.equal(a.units*3+a.unassigned,a.count);});
test('height lower than one module returns a useful empty result',()=>{const r=solve(input({maxHeight:2,moduleHeight:3.2}));assert.equal(r.alternatives.length,0);assert.ok(r.message);});
test('insufficient FAR including shared space returns no false feasible result',()=>{assert.equal(solve(input({far:1})).alternatives.length,0);});
test('wide modules can reduce feasible count',()=>{assert.ok(solve(input({width:6.6})).alternatives[0].count<solve(input()).alternatives[0].count);});
test('hole and concave boundaries reject crossing footprints',()=>{
 const hole=[[[0,0],[40,0],[40,40],[0,40],[0,0]],[[15,15],[25,15],[25,25],[15,25],[15,15]]];close(polygonArea(hole),1500);assert.equal(fits(rectangle(10,10,20,20),hole,0),false);assert.equal(fits(rectangle(2,2,10,10),hole,2),true);
 const concave=[[[0,0],[30,0],[30,10],[10,10],[10,30],[0,30],[0,0]]];assert.equal(fits(rectangle(5,5,20,20),concave,0),false);
});
test('setback measures edge distance and prevents almost touching edges',()=>{const p=[SAMPLES[0].ring];assert.equal(fits(rectangle(1.9,2,5,5),p,2),false);assert.equal(fits(rectangle(2,2,5,5),p,2),true);});
test('rotated parcel can use its edge direction',()=>{const p=[rectangle(0,0,38,30,Math.PI/6)],r=solve(input({},p));assert.ok(r.alternatives.length);for(const a of r.alternatives)assert.ok(fits(rectangle(a.x,a.y,a.width,a.depth,a.angle),p,2));});
test('invalid, fractional and excessively large inputs are rejected',()=>{
 for(const p of [{width:0},{far:Infinity},{maxFloors:2.2},{modulesPerUnit:1.2},{length:'6.6'}])assert.throws(()=>solve(input(p)));
 assert.throws(()=>solve(input({},[[[0,0],[40,0],[40,40],[0,40]]])));
 assert.throws(()=>solve(input({},[rectangle(0,0,500,500)])));
});
test('solver is deterministic and never mutates the source input',()=>{const i=input(),copy=structuredClone(i);assert.deepEqual(solve(i),solve(i));assert.deepEqual(i,copy);});
