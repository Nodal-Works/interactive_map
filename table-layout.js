/* One geographic footprint for overlays, clipping and companion-map gestures. */
(function(root) {
  'use strict';
  function affine(points, width, height) {
    const [o, x, , y] = points;
    const a=(x.x-o.x)/width,b=(x.y-o.y)/width,c=(y.x-o.x)/height,d=(y.y-o.y)/height;
    const det=a*d-b*c;
    if (Math.abs(det)<1e-12) throw Error('Degenerate table projection');
    return {a,b,c,d,e:o.x,f:o.y,
      project:(x,y)=>({x:o.x+a*x+c*y,y:o.y+b*x+d*y}),
      inverse:(x,y)=>({x:(d*(x-o.x)-c*(y-o.y))/det,y:(a*(y-o.y)-b*(x-o.x))/det})};
  }
  function bounds(points) {
    const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
    return {left,top,w:Math.max(...points.map(p=>p.x))-left,h:Math.max(...points.map(p=>p.y))-top};
  }
  const api={affine,bounds};
  if(typeof module!=='undefined')module.exports=api;
  if(!root.document)return;
  root.MR_TABLE=api;
  api.geometry=()=>{
    const rect=map.getContainer().getBoundingClientRect();
    // Campus corners run SE, NE, NW, SW. Preserve their identity through rotation.
    const corners=[3,2,1,0].map(i=>root.APP_CONFIG.area.corners[i]);
    const points=corners.map(c=>{const p=map.project(c);return {x:p.x+rect.left,y:p.y+rect.top};});
    return {...bounds(points),points,corners,mapRect:rect};
  };
  api.place=(element,tableLocal=false)=>{
    const g=api.geometry();
    let w=g.w,h=g.h;
    if(tableLocal){
      w=Math.hypot(g.points[1].x-g.points[0].x,g.points[1].y-g.points[0].y);
      h=Math.hypot(g.points[3].x-g.points[0].x,g.points[3].y-g.points[0].y);
    }
    w=Math.max(1,Math.ceil(w));h=Math.max(1,Math.ceil(h));
    Object.assign(element.style,{position:'fixed',left:tableLocal?'0px':g.left+'px',top:tableLocal?'0px':g.top+'px',
      right:'auto',bottom:'auto',width:w+'px',height:h+'px',transformOrigin:'0 0',transform:'none'});
    if(tableLocal){const m=affine(g.points,w,h);element.style.transform=`matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;element.style.clipPath='';}
    else element.style.clipPath=`polygon(${g.points.map(p=>`${p.x-g.left}px ${p.y-g.top}px`).join(',')})`;
    return {...g,w,h,width:w,height:h};
  };
  api.install=()=>{
    const refresh=()=>{
      for(const id of ['table-overlay','grid-animation-canvas','slideshow-canvas']){
        const el=document.getElementById(id);if(el)api.place(el,true);
      }
      for(const id of ['cfd-simulation-canvas','stormwater-canvas','street-life-canvas']){
        const el=document.getElementById(id);if(el)api.place(el);
      }
      root.dispatchEvent(new Event('mr-table-layout'));
    };
    let frame=null;
    const schedule=()=>{if(frame===null)frame=requestAnimationFrame(()=>{frame=null;refresh();});};
    map.on('move',schedule);map.on('moveend',refresh);root.addEventListener('resize',schedule);
    root.clipTableLayers=refresh;refresh();
  };
})(typeof window==='undefined'?globalThis:window);
