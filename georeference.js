/* Shared geographic alignment for local raster/model overlays. */
(function(root){
  'use strict';
  function affine(corners,project,offset={left:0,top:0}){
    const [nw,ne,,sw]=corners.map(project);
    const origin={x:nw.x-offset.left,y:nw.y-offset.top};
    const u={x:ne.x-nw.x,y:ne.y-nw.y},v={x:sw.x-nw.x,y:sw.y-nw.y};
    const det=u.x*v.y-u.y*v.x;
    if(Math.abs(det)<1e-10)throw Error('Degenerate geographic extent');
    return {origin,u,v,
      forward(x,y){return {x:origin.x+x*u.x+y*v.x,y:origin.y+x*u.y+y*v.y};},
      inverse(x,y){x-=origin.x;y-=origin.y;return {x:(x*v.y-y*v.x)/det,y:(y*u.x-x*u.y)/det};}};
  }
  root.MR_GEO={affine};
})(typeof window==='undefined'?globalThis:window);
