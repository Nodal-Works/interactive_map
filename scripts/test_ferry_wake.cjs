const assert=require('node:assert/strict'),W=require('../animations/ferry-wake.js');
const position=t=>({lng:11.9+t*.000045,lat:57.7+Math.sin(t*.08)*.00025});
function run(fps){let state;for(let i=0;i<=fps*30;i++)state=W.sample(state,position(i/fps),i/fps*1000);return state;}
const a=run(30),b=run(60),c=run(120);
for(const state of [a,b,c]){
 assert.ok(state.samples.length<=W.MAX_SAMPLES);assert.ok(state.samples.every(p=>p.time>10000));
 assert.equal(state.samples.length,b.samples.length);
 for(let i=0;i<state.samples.length;i++)assert.ok(W.distance(state.samples[i],b.samples[i])<.02,'Frame rates preserve geographic trail');
}
const project=(lng,lat)=>({x:lng*5000,y:lat*5000});
const g=W.geometry(a,project,30000);assert.ok(g.length>50);assert.ok(g[0].alpha<g.at(-1).alpha);
const rotated=W.geometry(a,(lng,lat)=>{const p=project(lng,lat);return {x:-p.y*2,y:p.x*2};},30000);
for(let i=0;i<g.length;i++)for(const side of ['left','right','center']){
 assert.ok(Math.abs(rotated[i][side].x+g[i][side].y*2)<1e-7);
 assert.ok(Math.abs(rotated[i][side].y-g[i][side].x*2)<1e-7);
}
assert.equal(W.geometry(a,project,51000).length,0,'Stopped wake fades completely');
assert.equal(W.sample(a,{lng:12.1,lat:57.7},31000).samples.length,1,'Teleport resets wake');
assert.ok(W.jumped({lng:11.9,lat:57.7},{lng:12.1,lat:57.7},10000));assert.ok(!W.jumped(position(0),position(10),10000));
console.log('PASS ferry wake frame-rate parity, bounded history, turns, time fading, jumps, zoom and bearing');
