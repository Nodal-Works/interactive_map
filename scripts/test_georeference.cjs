const assert=require('node:assert/strict');require('../georeference.js');
const corners=[[0,0],[100,0],[100,50],[0,50]];
for(const radians of [0,.4,1.57,-1.2]){
 const project=([x,y])=>({x:80+2*(x*Math.cos(radians)-y*Math.sin(radians)),y:90+2*(x*Math.sin(radians)+y*Math.cos(radians))});
 const t=MR_GEO.affine(corners,project,{left:20,top:30});
 for(const [u,v] of [[0,0],[1,1],[.23,.71]]){const p=t.forward(u,v),q=t.inverse(p.x,p.y);assert.ok(Math.abs(q.x-u)<1e-12);assert.ok(Math.abs(q.y-v)<1e-12);}
}
assert.throws(()=>MR_GEO.affine([[0,0],[0,0],[0,0],[0,0]],([x,y])=>({x,y})));
console.log('PASS geographic forward/inverse transforms at arbitrary bearings and canvas offsets');
