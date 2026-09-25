// Time-based geographic wakes, independent of polling frequency and screen bearing.
(function(root) {
  'use strict';
  const MAX_AGE=20000, SAMPLE_MS=100, MAX_SAMPLES=202, METRES=111320;
  function delta(a,b) {return {x:(b.lng-a.lng)*METRES*Math.cos((a.lat+b.lat)*Math.PI/360),y:(b.lat-a.lat)*METRES};}
  function distance(a,b) {const d=delta(a,b);return Math.hypot(d.x,d.y);}
  function jumped(a,b,elapsed) {return distance(a,b)>Math.max(300,Math.max(0,elapsed)/1000*22);}
  function sample(state,position,now) {
    if(!state || !state.last || now<state.last.time || distance(state.last,position)>300) {
      return {samples:[{...position,time:now}],last:{...position,time:now},next:now+SAMPLE_MS};
    }
    const previous=state.last;
    // Fixed time samples are interpolated between render frames.
    state.next=Math.max(state.next,now-MAX_AGE);
    while(state.next<=now) {
      const t=(state.next-previous.time)/Math.max(1,now-previous.time);
      const point={lng:previous.lng+(position.lng-previous.lng)*t,lat:previous.lat+(position.lat-previous.lat)*t,time:state.next};
      const last=state.samples.at(-1);
      if(!last || distance(last,point)>.15)state.samples.push(point);
      state.next+=SAMPLE_MS;
    }
    state.last={...position,time:now};
    state.samples=state.samples.filter(p=>now-p.time<MAX_AGE).slice(-MAX_SAMPLES);
    return state;
  }
  function geometry(state,project,now) {
    const samples=(state?.samples || []).filter(p=>now-p.time<MAX_AGE);
    return samples.map((point,i)=>{
      const a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)],d=delta(a,b),length=Math.hypot(d.x,d.y);
      if(length<.01)return null;
      const age=Math.max(0,now-point.time)/1000,spread=Math.min(11,.5+age*.65);
      const nx=-d.y/length,ny=d.x/length;
      const offset=sign=>project(point.lng+sign*nx*spread/(METRES*Math.cos(point.lat*Math.PI/180)),point.lat+sign*ny*spread/METRES);
      return {center:project(point.lng,point.lat),left:offset(1),right:offset(-1),alpha:Math.pow(1-age/(MAX_AGE/1000),2),age,time:point.time};
    }).filter(Boolean);
  }
  function draw(ctx,state,project,now) {
    const points=geometry(state,project,now);
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],alpha=Math.min(a.alpha,b.alpha);
      // A quiet translucent ribbon between two continuous spreading wake arms.
      ctx.fillStyle=`rgba(168,220,234,${alpha*.055})`;
      ctx.beginPath();ctx.moveTo(a.left.x,a.left.y);ctx.lineTo(b.left.x,b.left.y);ctx.lineTo(b.right.x,b.right.y);ctx.lineTo(a.right.x,a.right.y);ctx.closePath();ctx.fill();
      for(const side of ['left','right','center']) {
        ctx.strokeStyle=`rgba(213,242,250,${alpha*(side==='center'?.10:.36)})`;
        ctx.lineWidth=side==='center'?.8:1.15;
        ctx.beginPath();ctx.moveTo(a[side].x,a[side].y);ctx.lineTo(b[side].x,b[side].y);ctx.stroke();
      }
      // Discrete, expanding cross-ripples follow the curve, without full rings.
      if(Math.floor(a.time/1400)!==Math.floor(b.time/1400)) {
        ctx.strokeStyle=`rgba(224,245,250,${alpha*.18})`;ctx.lineWidth=.7;
        ctx.beginPath();ctx.moveTo(b.left.x,b.left.y);
        ctx.quadraticCurveTo(b.center.x,b.center.y,b.right.x,b.right.y);ctx.stroke();
      }
    }
    ctx.restore();
  }
  root.MR_FERRY_WAKE={sample,geometry,draw,jumped,distance,MAX_AGE,MAX_SAMPLES};
  if(typeof module!=='undefined')module.exports=root.MR_FERRY_WAKE;
})(typeof window==='undefined'?globalThis:window);
