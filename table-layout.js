/* Physical table geometry, camera fitting and display scale. No DOM dependencies. */
(function(root) {
  'use strict';
  const positive = (v, fallback) => Number.isFinite(v) && v > 0 ? v : fallback;
  function grid(d) {
    return {columns: Number.isInteger(d.columns) && d.columns > 0 ? d.columns : Math.max(1, Math.floor(d.tableWidth / positive(d.tileSize,20))),
      rows: Number.isInteger(d.rows) && d.rows > 0 ? d.rows : Math.max(1, Math.floor(d.tableHeight / positive(d.tileSize,20)))};
  }
  function rectangle(d, viewport, mapRect) {
    let w, h, cx, cy;
    if (d.layoutMode === 'preview') {
      // Fit the map AND its two physical control rails as one table assembly.
      const scale = Math.min(viewport.width / (d.tableWidth + 2*positive(d.sidebarWidth,7.5)), viewport.height / d.tableHeight);
      w = d.tableWidth * scale; h = d.tableHeight * scale;
      cx = viewport.width/2; cy = viewport.height/2;
    } else {
      // Legacy presets deliberately retain their original width-based calculation.
      const sx = viewport.width / d.screenWidth;
      const sy = d.layoutMode === 'projector' ? viewport.height / d.screenHeight : sx;
      w = d.tableWidth*sx; h = d.tableHeight*sy;
      cx = viewport.width/2; cy = viewport.height/2;
    }
    // Fractional CSS pixels preserve square tiles and the exact aspect ratio.
    return {w,h,left:cx-w/2,top:cy-h/2, mapLeft:cx-w/2-mapRect.left,mapTop:cy-h/2-mapRect.top};
  }
  function mercator([lng,lat]) {
    const s=Math.sin(lat*Math.PI/180);
    return {x:(lng+180)/360*512,y:(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*512};
  }
  function unmercator(p) {
    return {lng:p.x/512*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*p.y/512)))*180/Math.PI};
  }
  function fit(corners, target, mapSize, flip=false) {
    const points=corners.map(mercator);
    // Source corners are SW, SE, NE, NW. Align source north toward screen left.
    const north={x:points[3].x-points[0].x,y:points[3].y-points[0].y};
    const angle=Math.atan2(north.y,north.x)+Math.PI+(flip?Math.PI:0);
    const c=Math.cos(angle),s=Math.sin(angle);
    const rotated=points.map(p=>({x:c*p.x+s*p.y,y:-s*p.x+c*p.y}));
    const xs=rotated.map(p=>p.x),ys=rotated.map(p=>p.y);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const scale=Math.min(target.w/(maxX-minX),target.h/(maxY-minY));
    if (!Number.isFinite(scale) || scale<=0) throw Error('Cannot fit a degenerate table extent');
    const x=(minX+maxX)/2+(mapSize.width/2-target.mapLeft-target.w/2)/scale;
    const y=(minY+maxY)/2+(mapSize.height/2-target.mapTop-target.h/2)/scale;
    return {center:unmercator({x:c*x-s*y,y:s*x+c*y}),zoom:Math.log2(scale),bearing:((angle*180/Math.PI+540)%360)-180,pitch:0};
  }
  function pixelsPerMetre(zoom,lat) { return 512*2**zoom/(40075016.68557849*Math.cos(lat*Math.PI/180)); }
  function symbol(length,width,minLength,ppm) {
    const scale=Math.max(ppm,minLength/length);
    return {length:length*scale,width:width*scale};
  }
  function presentation(d, rect) {
    if (!d.layoutMode || d.layoutMode==='legacy') return {scale:1,rail:60};
    const pixelsPerCm=Math.min(rect.w/d.tableWidth,rect.h/d.tableHeight);
    // Existing ornament dimensions use an 8 px/cm design basis: 24 px icon = 3 cm.
    return {scale:pixelsPerCm/8,rail:positive(d.sidebarWidth,7.5)*rect.w/d.tableWidth};
  }
  root.MR_TABLE={grid,rectangle,fit,mercator,pixelsPerMetre,symbol,presentation};
})(typeof window==='undefined'?globalThis:window);
