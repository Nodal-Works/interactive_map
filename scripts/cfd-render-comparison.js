/* Real browser raster comparisons, deliberately separate from live FPS measurements. */
(function(){
  const reference=document.getElementById('reference'),canvas=document.getElementById('gpu'),output=document.getElementById('result');
  const ctx=reference.getContext('2d',{willReadFrequently:true}),read=document.createElement('canvas');read.width=600;read.height=400;
  const readCtx=read.getContext('2d',{willReadFrequently:true});let gpu;
  function fixture(){
    const g={...CFD.domain(600,400,100,0),...CFD.DEFAULTS,resolution:100};
    g.solid=new Uint8Array(g.nx*g.ny);g.ux=new Float32Array(g.nx*g.ny);g.uy=new Float32Array(g.nx*g.ny);g.latticeSpeed=.025;
    for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++){
      const px=(x-g.x0)*g.cellSize,py=(y-g.y0)*g.cellSize,n=y*g.nx+x;
      g.solid[n]=(px>=230&&px<290&&py>=130&&py<270)||(px>=340&&px<400&&py>=160&&py<240)?1:0;
      g.ux[n]=g.solid[n]?0:.019*Math.cos((py-190)/95);g.uy[n]=g.solid[n]?0:.01*Math.sin((px-240)/90);
    }
    const feature={geometry:{type:'Polygon',coordinates:[[[230,130],[290,130],[290,270],[230,270],[230,130]]]}};
    g.facadeEdges=CFDVisuals.facadeEdges([feature],p=>({x:p[0],y:p[1]}),g);return g;
  }
  function referenceDraw(g,v,s){
    ctx.clearRect(0,0,600,400);const heat=document.createElement('canvas');heat.width=g.vw;heat.height=g.vh;
    const h=heat.getContext('2d'),image=h.createImageData(g.vw,g.vh),mask=h.createImageData(g.vw,g.vh);
    const colors=Array.from({length:256},(_,i)=>CFD.speedColor(i*s.colorMaxMps/255,s.palette,s.colorMaxMps));
    for(let y=0;y<g.vh;y++)for(let x=0;x<g.vw;x++){
      const n=(y+g.y0)*g.nx+x+g.x0,i=(y*g.vw+x)*4;
      image.data.set([...colors[Math.min(255,Math.round(Math.hypot(g.ux[n],g.uy[n])*g.windSpeed/g.latticeSpeed*255/s.colorMaxMps))],g.solid[n]?0:51],i);
      mask.data[i+3]=g.solid[n]?255:0;
    }
    h.putImageData(image,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=s.visualStyle==='particles'?.45:1;
    ctx.drawImage(heat,0,0,g.vw*g.cellSize,g.vh*g.cellSize);ctx.globalAlpha=1;v.draw(ctx);
    h.putImageData(mask,0,0);ctx.globalCompositeOperation='destination-out';ctx.drawImage(heat,0,0,g.vw*g.cellSize,g.vh*g.cellSize);ctx.globalCompositeOperation='source-over';v.drawFacades(ctx);
  }
  document.getElementById('run').onclick=async()=>{
    try {
      const rows=[];let id=0;
      for(const visualStyle of ['particles','ribbons'])for(const palette of Object.keys(CFD.PALETTES))for(const facadeGlow of [false,true]){
        output.textContent=`Comparing ${visualStyle}, ${palette}, glow ${facadeGlow}`;
        await new Promise(resolve=>setTimeout(resolve,0));
        const g=fixture(),settings={...CFD.DEFAULTS,visualStyle,palette,facadeGlow,particles:1000},v=new CFDVisuals.Renderer(g,settings);
        let seed=7;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
        if(visualStyle==='particles')v.model=new CFDVisuals.Particles(g,1000,random);
        gpu?.dispose();gpu=new CFDGPU.Renderer(canvas,g,v,settings);
        for(let i=0;i<180;i++)v.update(1/60);
        referenceDraw(g,v,settings);gpu.draw(1000,++id);
        readCtx.clearRect(0,0,600,400);readCtx.drawImage(canvas,0,0);
        const a=ctx.getImageData(0,0,600,400).data,b=readCtx.getImageData(0,0,600,400).data;
        // Compare premultiplied colour so invisible RGB cannot inflate differences.
        let error=0,outliers=0;
        for(let i=0;i<a.length;i+=4){let max=0;for(let c=0;c<4;c++){const d=Math.abs(c===3?a[i+c]-b[i+c]:a[i+c]*a[i+3]/255-b[i+c]*b[i+3]/255);error+=d;max=Math.max(max,d);}if(max>32)outliers++;}
        rows.push({visualStyle,palette,facadeGlow,meanChannelError:error/a.length,pixelFractionAbove32:outliers/(a.length/4)});
      }
      const report={label:'wind-raster-comparison',rows,pass:rows.every(r=>r.meanChannelError<2&&r.pixelFractionAbove32<.02)};
      output.textContent=JSON.stringify(report,null,2);fetch('/__benchmark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)}).catch(()=>{});
    }catch(e){output.textContent=e.stack;}
  };
  document.getElementById('loss').onclick=()=>{
    const extension=gpu?.gl.getExtension('WEBGL_lose_context');if(!extension){output.textContent='Context loss extension unavailable';return;}
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();output.textContent='Context lost; restoring';setTimeout(()=>extension.restoreContext(),100);},{once:true});
    canvas.addEventListener('webglcontextrestored',()=>{output.textContent='Context restored. Run fixtures again to verify resource recreation.';},{once:true});extension.loseContext();
  };
})();
