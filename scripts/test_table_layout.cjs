const assert=require('node:assert/strict');
const {affine,bounds}=require('../table-layout.js');
for(const angle of [0,.1,Math.PI/2,Math.PI])for(const scale of [.5,1,2]){
 const c=Math.cos(angle)*scale,s=Math.sin(angle)*scale;
 const transform=(x,y)=>({x:80+c*x-s*y,y:-120+s*x+c*y});
 const points=[[0,0],[1000,0],[1000,600],[0,600]].map(([x,y])=>transform(x,y));
 const m=affine(points,1000,600);
 for(const [x,y]of [[0,0],[1000,600],[345,234]]){
  const p=m.project(x,y),expected=transform(x,y),back=m.inverse(p.x,p.y);
  assert.ok(Math.hypot(p.x-expected.x,p.y-expected.y)<1e-8);
  assert.ok(Math.hypot(back.x-x,back.y-y)<1e-8);
 }
 const b=bounds(points);assert.ok(b.w>0&&b.h>0);
}
assert.throws(()=>affine([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}],1,1),/Degenerate/);
console.log('PASS table projection, translation, scale, rotation and inverse gestures');
