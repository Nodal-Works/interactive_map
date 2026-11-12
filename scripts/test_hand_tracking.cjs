const assert=require('node:assert/strict');
const {calibrate,Tracker}=require('../session/js/hand-tracking-core.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
// A camera view rotated and foreshortened relative to the projector.
const cameraPoint=(u,v)=>({x:(.5*u-.2*v+.3)/(.2*u+.1*v+1),y:(.1*u+.5*v+.15)/(.2*u+.1*v+1)});
const projection=calibrate([[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>cameraPoint(u,v)));
for(const [x,y] of [[0,0],[1,0],[1,1],[0,1],[.25,.7],[.5,.5],[-.1,1.2]]) {
  const actual=projection(cameraPoint(x,y));close(actual.x,x);close(actual.y,y);
}
assert.throws(()=>calibrate([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]));
assert.throws(()=>calibrate(Array(4).fill({x:0,y:0})));
const landmarks=(ratio,x=.5)=>{
  const hand=Array.from({length:21},()=>({x,y:.5}));
  hand[0]={x,y:.8};hand[9]={x,y:.6};hand[4]={x:x+.2*ratio,y:.5};return hand;
};
const tracker=new Tracker(),identity=p=>p;
let time=0;
const sample=hand=>{let result;for(let i=0;i<4;i++)result=tracker.update(hand,identity,time+=100);return result;};
assert.equal(sample(landmarks(.2)).down,false,'closed hand at acquisition cannot click');
sample(landmarks(.8));
assert.equal(sample(landmarks(.2)).down,true);
assert.equal(sample(landmarks(.4)).pinched,true,'hysteresis avoids pinch chatter');
assert.equal(sample(landmarks(.2)).down,false,'held pinch cannot repeat selection');
assert.equal(tracker.update(landmarks(.8),identity,time+=100).up,true);
assert.equal(sample(landmarks(.2)).down,true);
assert.equal(sample(null),null);
assert.equal(sample(landmarks(.2)).down,false,'reacquisition needs open hand');
sample(landmarks(.8));
assert.equal(sample(landmarks(.2,1.1)),null,'outside table is rejected, not clamped');
assert.equal(sample(landmarks(.2)).down,false);
assert.equal(tracker.update(landmarks(.8),null,time+=100),null,'no actions before calibration');
const deliberate=new Tracker();
deliberate.update(landmarks(.8),identity,0);deliberate.update(landmarks(.8),identity,150);
assert.equal(deliberate.update(landmarks(.2),identity,200).down,false);
assert.equal(deliberate.update(landmarks(.2),identity,400).down,false,'brief pinch cannot select');
assert.equal(deliberate.update(landmarks(.8),identity,410).pinched,false,'brief pinch cancels');
assert.equal(deliberate.update(landmarks(.2),identity,500).down,false);
assert.equal(deliberate.update(landmarks(.2),identity,725).down,true,'a held pinch selects');
// Closing the index finger must not drag the aim away from its open-hand target.
const stable=new Tracker();stable.update(landmarks(.8),identity,0);stable.update(landmarks(.8),identity,150);
const flexed=landmarks(.2);flexed[8]={x:.38,y:.64};flexed[4]={x:.42,y:.64};
let closed=stable.update(flexed,identity,200);close(closed.x,.5);close(closed.y,.5);
closed=stable.update(flexed,identity,450);assert.equal(closed.down,true);close(closed.x,.5);close(closed.y,.5);
const moved=flexed.map(p=>({x:p.x+.1,y:p.y}));
const dragging=stable.update(moved,identity,500);assert.ok(dragging.x>.5,'pinched drawing follows whole-hand movement');
close(dragging.pressOrigin.x,.5);close(dragging.pressOrigin.y,.5);
const reopened=landmarks(.8,.6);const release=stable.update(reopened,identity,550);
assert.equal(release.up,true);close(release.y,.5);assert.ok(release.x>=dragging.x,'opening the fingers does not recoil the cursor');
stable.update(null,identity,600);assert.equal(stable.aimOffset,null,'lost hand clears its aiming reference');
// No hand-input path may invoke MapLibre navigation or synthetic mouse input.
const fs=require('node:fs');
const runtime=fs.readFileSync(require.resolve('../session/js/hand-tracking.js'),'utf8');
assert.doesNotMatch(runtime,/\b(?:panBy|panTo|flyTo|easeTo|setCenter|setZoom|setBearing|fitBounds|MouseEvent|PointerEvent)\s*\(/);
console.log('Hand tracking: perspective calibration, pinch gating, loss recovery, bounds, and fixed-map checks passed.');
