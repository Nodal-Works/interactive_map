/* Static display smoothing of prepared colour cells, masked to valid data.
   No new routing values are inferred; legends and statistics use source values. */
(function(root){
  'use strict';
  const mercator=([lng,lat])=>[lng/360+.5,.5-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/(2*Math.PI)];
  const geographic=([x,y])=>[(x-.5)*360,Math.atan(Math.sinh((.5-y)*2*Math.PI))*180/Math.PI];
  function geometry(features,size=1536){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    const polygons=features.map(feature=>{
      const g=feature.geometry,parts=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];
      return parts.map(rings=>rings.map(ring=>ring.map(point=>{const [x,y]=mercator(point);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);return[x,y];})));
    });
    if(!Number.isFinite(minX)||maxX<=minX||maxY<=minY)return null;
    const scale=size/Math.max(maxX-minX,maxY-minY),width=Math.ceil((maxX-minX)*scale),height=Math.ceil((maxY-minY)*scale);
    // The image bounds must match the rounded pixel dimensions exactly.
    maxX=minX+width/scale;maxY=minY+height/scale;
    return {width,height,scale,polygons:polygons.map(parts=>parts.map(rings=>rings.map(ring=>ring.map(([x,y])=>[(x-minX)*scale,(y-minY)*scale])))),
      coordinates:[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]].map(geographic),
      metresPerPixel:40075016.686*Math.cos(geographic([(minX+maxX)/2,(minY+maxY)/2])[1]*Math.PI/180)/scale};
  }
  function colour(value,bins,colors){
    if(!Number.isFinite(value))return null;
    let i=0;while(i<bins.length-1&&value>=bins[i+1])i++;
    const a=colors[i],b=colors[Math.min(i+1,colors.length-1)],t=i===bins.length-1?0:Math.max(0,(value-bins[i])/(bins[i+1]-bins[i]));
    const rgb=c=>[1,3,5].map(offset=>parseInt(c.slice(offset,offset+2),16));
    return 'rgb('+rgb(a).map((n,j)=>Math.round(n+(rgb(b)[j]-n)*t)).join(',')+')';
  }
  function create(features,metadata,colors){
    const plan=geometry(features);if(!plan||!root.document)return null;
    // Older research snapshots keep their original mixed grid presentation.
    if(metadata.legendMode!=='continuous'||metadata.displaySpacingMetres!==50)return null;
    const cache=new Map();
    function image(index){
      if(cache.has(index))return cache.get(index);
      const canvas=root.document.createElement('canvas'),smooth=root.document.createElement('canvas');
      for(const c of [canvas,smooth]){c.width=plan.width;c.height=plan.height;}
      const raw=canvas.getContext('2d'),ctx=smooth.getContext('2d');
      for(let i=0;i<features.length;i++){
        const color=colour(features[i].properties.values[index],metadata.bins,colors);if(!color)continue;
        raw.fillStyle=color;
        for(const rings of plan.polygons[i]){raw.beginPath();for(const ring of rings){ring.forEach(([x,y],j)=>j?raw.lineTo(x,y):raw.moveTo(x,y));raw.closePath();}raw.fill('evenodd');}
      }
      // A modest 20 m display blur removes tile edges, not neighbourhood detail.
      ctx.filter=`blur(${20/plan.metresPerPixel}px)`;ctx.drawImage(canvas,0,0);ctx.filter='none';
      // Restore the original validity mask: empty cells and holes stay transparent.
      // Binary alpha removes hairline seams from independently rasterized cells.
      const mask=raw.getImageData(0,0,plan.width,plan.height);
      for(let i=3;i<mask.data.length;i+=4)mask.data[i]=mask.data[i]>0?255:0;
      raw.putImageData(mask,0,0);ctx.globalCompositeOperation='destination-in';ctx.drawImage(canvas,0,0);
      const result={url:smooth.toDataURL('image/png'),coordinates:plan.coordinates};cache.set(index,result);
      return result;
    }
    return {image,dispose(){cache.clear();}};
  }
  const api={geometry,colour,create};root.MR_MOBILITY_RASTER=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
