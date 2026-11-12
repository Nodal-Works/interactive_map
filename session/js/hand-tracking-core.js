(function(root) {
  'use strict';
  // Camera-plane quadrilateral to table unit square (perspective included).
  function calibrate(points) {
    if (points.length !== 4) throw Error('Choose all four table corners.');
    const target = [[0,0],[1,0],[1,1],[0,1]], rows = [];
    let sign = 0;
    for (let i=0;i<4;i++) {
      const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
      const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if (!Number.isFinite(cross) || Math.abs(cross)<0.0001 || (sign && Math.sign(cross)!==sign))
        throw Error('Corners must form a clear rectangle in the numbered order.');
      sign=Math.sign(cross);
      const {x,y}=a,[u,v]=target[i];
      rows.push([x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v]);
    }
    for(let col=0;col<8;col++) {
      let pivot=col;
      for(let r=col+1;r<8;r++)if(Math.abs(rows[r][col])>Math.abs(rows[pivot][col]))pivot=r;
      [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
      const scale=rows[col][col];
      if(Math.abs(scale)<1e-10)throw Error('Calibration is too narrow. Try again.');
      rows[col]=rows[col].map(v=>v/scale);
      for(let r=0;r<8;r++)if(r!==col) {
        const factor=rows[r][col];rows[r]=rows[r].map((v,j)=>v-factor*rows[col][j]);
      }
    }
    const h=rows.map(row=>row[8]);
    return ({x,y})=>{
      const d=h[6]*x+h[7]*y+1;
      return {x:(h[0]*x+h[1]*y+h[2])/d,y:(h[3]*x+h[4]*y+h[5])/d};
    };
  }
  class Tracker {
    constructor(){this.reset();}
    reset(){this.pinched=false;this.armed=false;this.position=null;this.openSince=null;this.closedSince=null;this.aimOffset=null;this.pressOrigin=null;}
    update(landmarks,project,time=performance.now()) {
      if(!landmarks||!project){this.reset();return null;}
      const tip=landmarks[8],thumb=landmarks[4],wrist=landmarks[0],base=landmarks[9];
      const ratio=Math.hypot(tip.x-thumb.x,tip.y-thumb.y)/Math.max(.01,Math.hypot(wrist.x-base.x,wrist.y-base.y));
      const joints=landmarks.map(project);
      if(joints.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))){this.reset();return null;}
      const palm=[0,5,9,13,17].reduce((p,i)=>({x:p.x+joints[i].x/5,y:p.y+joints[i].y/5}),{x:0,y:0});
      // Capture the extended finger's aim once, then steer with the rigid palm.
      // Finger flexion must not displace the cursor during pinch or release.
      if(!this.aimOffset&&ratio>=.5)this.aimOffset={x:joints[8].x-palm.x,y:joints[8].y-palm.y};
      const p=this.aimOffset?{x:palm.x+this.aimOffset.x,y:palm.y+this.aimOffset.y}:joints[8];
      if(p.x<0||p.x>1||p.y<0||p.y>1){this.reset();return null;}
      const pinch=ratio<(this.pinched?.5:.32);
      const closing=ratio<.65;
      if(closing&&!this.pressOrigin)this.pressOrigin={...(this.position||p)};
      if(!closing)this.pressOrigin=null;
      // Require an open hand after reacquisition, calibration, or mode change.
      if(!pinch){
        this.closedSince=null;
        if(this.openSince===null)this.openSince=time;
        if(time-this.openSince>=120)this.armed=true;
      }else{
        this.openSince=null;
        if(this.closedSince===null)this.closedSince=time;
      }
      // Ignore brief landmark overlap and twitchy pinch detections.
      const pressed=pinch&&this.armed&&(this.pinched||time-this.closedSince>=220);
      const down=pressed&&!this.pinched,up=!pressed&&this.pinched;
      this.pinched=pressed;
      this.position=this.position?{x:this.position.x*.45+p.x*.55,y:this.position.y*.45+p.y*.55}:p;
      return {...this.position,down,up,pinched:this.pinched,closing,pressOrigin:this.pressOrigin,
        progress:pinch&&this.armed?Math.min(1,(time-this.closedSince)/220):0,joints,palm};
    }
  }
  const api={calibrate,Tracker};
  if(typeof module!=='undefined')module.exports=api;
  root.MR_HAND_CORE=api;
})(typeof window==='undefined'?globalThis:window);
