/* Shared, deterministic scene state and original-vector rendering for Artwork. */
(function(root){
  'use strict';
  const W=3370,H=2384, clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)), ease=t=>{t=clamp(t);return t*t*(3-2*t);};
  const OPENING_FADE_MS=800,OPENING_DRAW_MS=10000;
  const duration=(chapter,reduced)=>reduced?180:chapter===0?OPENING_FADE_MS+OPENING_DRAW_MS:chapter===8?2000:3100;
  function frame(state,now=Date.now()) {
    const elapsed=Math.max(0,now-state.startedAt), d=duration(state.chapter,state.reducedMotion);
    const t=state.transitioning?clamp(elapsed/d):1;
    const current=state.chapter, previous=state.fromChapter??current;
    const weight=(chapter,id)=>chapter===8?.68:chapter===0||id>chapter?0:id===chapter?1:.25;
    const fields=Array.from({length:7},(_,i)=>{
      const id=i+1,old=weight(previous,id),next=weight(current,id);
      const arriving=id===current&&current>previous&&current<8;
      return {opacity:old+(next-old)*ease(t),reveal:arriving?ease(clamp((elapsed-300)/2000)):1};
    });
    if(state.reducedMotion)fields.forEach(f=>f.reveal=1);
    const opening=current===0;
    return {fields,t,elapsed,done:t===1,base:opening?ease(clamp((elapsed-(state.reducedMotion?0:OPENING_FADE_MS))/(state.reducedMotion?180:OPENING_DRAW_MS))):1,
      black:opening?ease(clamp(elapsed/(state.reducedMotion?180:OPENING_FADE_MS))):1};
  }
  function transition(state,chapter,now=Date.now()) {
    if(state.loading||state.error||!state.isActive||chapter<0||chapter>8)return false;
    state.fromChapter=chapter===0?0:state.chapter;state.chapter=chapter;state.startedAt=now;state.transitioning=true;state.hover=0;return true;
  }
  function geo(matrix,x,y){const [a,b]=matrix,X=a[0]*x+a[1]*y+a[2],Y=b[0]*x+b[1]*y+b[2];return [X/6378137*180/Math.PI,(2*Math.atan(Math.exp(Y/6378137))-Math.PI/2)*180/Math.PI];}
  function affine(p0,p1,p2){const a=(p1.x-p0.x)/W,b=(p1.y-p0.y)/W,c=(p2.x-p0.x)/H,d=(p2.y-p0.y)/H,e=p0.x,f=p0.y,det=a*d-b*c;
    return {a,b,c,d,e,f,scale:Math.sqrt(Math.abs(det)),forward:(x,y)=>({x:a*x+c*y+e,y:b*x+d*y+f}),inverse:(x,y)=>({x:(d*(x-e)-c*(y-f))/det,y:(a*(y-f)-b*(x-e))/det})};}
  function imageFromText(text){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'})),im=new Image();im.onload=()=>{URL.revokeObjectURL(url);resolve(im);};im.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Could not decode original artwork'));};im.src=url;});}
  // Source SVG paths are batched by stroke style, with their original matrices.
  // No tracing or path simplification. A lens draws these paths at its own resolution.
  function vectors(text){
    const doc=new DOMParser().parseFromString(text,'image/svg+xml'),result=[],births=new Map();
    let groups=new Map();
    const flush=()=>{result.push(...groups.values());groups=new Map();};
    for(const el of doc.querySelectorAll('path')){
      if(el.closest('defs'))continue;
      const stroke=el.getAttribute('stroke'),fill=el.getAttribute('fill');
      const width=Number(el.getAttribute('stroke-width')||1),alpha=Number(el.getAttribute('stroke-opacity')||1);
      const cap=el.getAttribute('stroke-linecap')||'butt',join=el.getAttribute('stroke-linejoin')||'miter';
      const nums=el.getAttribute('transform')?.match(/matrix\(([^)]+)\)/)?.[1].split(/[ ,]+/).map(Number);
      const transformed=new Path2D();transformed.addPath(new Path2D(el.getAttribute('d')),new DOMMatrix(nums||[1,0,0,1,0,0]));
      if(fill&&fill!=='none'){
        flush();result.push({path:transformed,stroke,width,alpha,cap,join,fill,fillAlpha:Number(el.getAttribute('fill-opacity')||1)});
      }else if(stroke&&stroke!=='none'){
        const key=[stroke,width,alpha,cap,join].join('|');
        if(!groups.has(key))groups.set(key,{path:new Path2D(),stroke,width,alpha,cap,join});
        groups.get(key).path.addPath(transformed);
        // A fixed spatial rhythm lights separate outlines and hatch strokes in
        // staggered clusters. This is drawn from the original paths, not a wipe.
        const first=el.getAttribute('d').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.slice(0,2).map(Number)||[0,0];
        const m=nums||[1,0,0,1,0,0],x=m[0]*first[0]+m[2]*first[1]+m[4],y=m[1]*first[0]+m[3]*first[1]+m[5];
        const distance=Math.min(Math.hypot(x-1340,y-1563),Math.hypot(x-2450,y-700),Math.hypot(x-650,y-800));
        const grain=Math.abs(Math.sin(x*12.9898+y*78.233)*43758.5453)%1;
        const bucket=Math.min(23,Math.floor((distance/1900*.68+grain*.32)*24)),birthKey=bucket+'|'+key;
        if(!births.has(birthKey))births.set(birthKey,{path:new Path2D(),width,alpha,cap,join,bucket});
        births.get(birthKey).path.addPath(transformed);
      }
    }
    flush();result.births=[...births.values()];return result;
  }

  class Scene {
    constructor(manifest,base,paths,items){Object.assign(this,{manifest,base,paths,items});}
    static async load(signal){
      const directory=new URL('media/artwork/',document.baseURI),response=await fetch(new URL('manifest.json',directory),{signal});
      if(!response.ok)throw Error('Artwork assets are unavailable');const manifest=await response.json();
      const get=async file=>{const r=await fetch(new URL(file,directory),{signal});if(!r.ok)throw Error('Missing artwork asset: '+file);return r.text();};
      const text=await get(manifest.base),base=await imageFromText(text),paths=vectors(text);
      const items=await Promise.all(manifest.items.map(async item=>({...item,fieldImage:await imageFromText(await get(item.field)),sculptureImage:await imageFromText(await get(item.sculpture))})));
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');return new Scene(manifest,base,paths,items);
    }
    lines(ctx,lightOnly=false){
      ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
      for(const p of this.paths){if(p.fill){ctx.fillStyle=p.fill;ctx.globalAlpha=p.fillAlpha;if(lightOnly)ctx.globalCompositeOperation='destination-out';ctx.fill(p.path);ctx.globalCompositeOperation='source-over';}if(p.stroke&&p.stroke!=='none'){ctx.strokeStyle=p.stroke;ctx.lineWidth=p.width;ctx.lineCap=p.cap;ctx.lineJoin=p.join;ctx.globalAlpha=p.alpha;ctx.stroke(p.path);}}ctx.restore();
    }
    awaken(ctx,progress,reduced=false){
      ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
      if(reduced){ctx.globalAlpha=progress;ctx.drawImage(this.base,0,0,W,H);ctx.restore();return;}
      // A faint underlying drawing becomes legible as hundreds of independent
      // groups ignite, trace their original contours, then settle to white.
      ctx.globalAlpha=progress*.22;ctx.drawImage(this.base,0,0,W,H);
      for(const p of this.paths.births||[]){
        const t=clamp((progress-p.bucket/24*.62)/.38);if(!t)continue;
        const flash=Math.sin(t*Math.PI),ink=ease(t);
        ctx.strokeStyle=flash>.45?'#fff0d3':'#fff';ctx.lineWidth=p.width;ctx.lineCap=p.cap;ctx.lineJoin=p.join;ctx.globalAlpha=ink*p.alpha;
        ctx.setLineDash(t<1?[Math.max(1,ink*450),450*(1-ink)]:[]);ctx.lineDashOffset=-60*(1-ink);if(flash>.7){ctx.globalAlpha=flash*.2;ctx.lineWidth=p.width+1.5;ctx.stroke(p.path);ctx.globalAlpha=ink*p.alpha;ctx.lineWidth=p.width;}ctx.stroke(p.path);
      }
      ctx.setLineDash([]);
      // Original dark masks remain in place throughout the appearance.
      for(const p of this.paths)if(p.fill){ctx.globalAlpha=p.fillAlpha;ctx.fillStyle=p.fill;ctx.fill(p.path);}
      ctx.restore();
    }
    draw(ctx,state,now=Date.now(),options={}){
      const f=frame(state,now);ctx.save();
      if(!options.skipBase&&f.base<1)this.awaken(ctx,f.base,state.reducedMotion);
      else if(!options.skipBase){options.vector?this.lines(ctx):ctx.drawImage(this.base,0,0,W,H);}
      for(const id of this.manifest.stacking){const item=this.items[id-1],v=f.fields[id-1];if(!v.opacity)continue;
        ctx.save();const hoverMix=ease((now-(state.hoverStartedAt||0))/450);ctx.globalAlpha=state.chapter===8?v.opacity+(.97-v.opacity)*(state.hover===id?hoverMix:state.previousHover===id?1-hoverMix:0):v.opacity;
        if(v.reveal<1){ctx.beginPath();ctx.arc(...item.anchor,Math.max(...[0,2].flatMap(x=>[1,3].map(y=>Math.hypot(item.fieldBounds[x]-item.anchor[0],item.fieldBounds[y]-item.anchor[1]))))*v.reveal,0,Math.PI*2);ctx.clip();}
        ctx.drawImage(item.fieldImage,0,0,W,H);ctx.restore();
      }
      for(const item of this.items){const v=f.fields[item.id-1];if(v.opacity<=0)continue;ctx.save();ctx.globalAlpha=clamp(v.opacity*4);
        ctx.drawImage(item.sculptureImage,0,0,W,H);ctx.restore();}
      if(state.transitioning&&state.chapter>0&&state.chapter<8&&f.elapsed<2600&&!state.reducedMotion){
        const item=this.items[state.chapter-1],pulse=Math.sin(clamp(f.elapsed/2600)*Math.PI),r=18+35*pulse;
        const g=ctx.createRadialGradient(...item.anchor,2,...item.anchor,r);g.addColorStop(0,`rgba(255,224,173,${.28*pulse})`);g.addColorStop(1,'rgba(255,224,173,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(...item.anchor,r,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();return f;
    }
  }
  // Inner 70% remains undistorted; the rim gently compresses the sample inward.
  function lensRadius(r){return r*(1-.28*ease((r-.7)/.3)*(1-ease((r-.7)/.3)));}
  class Lens {
    constructor(canvas){this.canvas=canvas;this.source=document.createElement('canvas');this.linesCanvas=document.createElement('canvas');this.lightCanvas=document.createElement('canvas');this.cacheKey='';
      try{this.glCanvas=document.createElement('canvas');this.gl=this.glCanvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false});if(this.gl)this.setup();}catch(_){this.gl=null;}
      this.ctx=canvas.getContext('2d');
    }
    setup(){const gl=this.gl;
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
      this.vs=shader(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);gl_Position=vec4(p,0.,1.);}');
      this.fs=shader(gl.FRAGMENT_SHADER,`precision mediump float;
        varying vec2 uv;uniform sampler2D image;
        void main(){
          vec2 p=uv*2.-1.;float r=length(p),edge=smoothstep(.7,1.,r);
          vec2 q=p*(1.-.28*edge*(1.-edge));
          vec3 color=texture2D(image,q*.5+.5).rgb;
          // Tiny spectral separation only in the glass rim; the centre stays exact.
          vec2 fringe=p*.0018*edge;
          color.r=texture2D(image,q*.5+.5+fringe).r;
          color.b=texture2D(image,q*.5+.5-fringe).b;
          float rim=smoothstep(.963,.982,r)*(1.-smoothstep(.987,1.,r));
          float reflection=pow(max(0.,dot(normalize(p+vec2(.0001)),normalize(vec2(-.55,-.8)))),10.);
          color*=1.-.16*edge;
          color+=vec3(.78,.71,.55)*rim*(.16+.55*reflection);
          color+=vec3(.2,.18,.14)*edge*(1.-r)*reflection;
          gl_FragColor=vec4(color*(1.-smoothstep(.994,1.,r)),1.);
        }`);
      this.program=gl.createProgram();gl.attachShader(this.program,this.vs);gl.attachShader(this.program,this.fs);gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error('Lens shader unavailable');gl.useProgram(this.program);
      this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const p=gl.getAttribLocation(this.program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
      this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    }
    draw(scene,state,now){
      const css=Math.max(1,this.canvas.getBoundingClientRect().width),size=Math.min(1440,Math.round(css*(devicePixelRatio||1))),lens=state.lens;
      if(this.canvas.width!==size||this.canvas.height!==size||this.source.width!==size){this.canvas.width=this.canvas.height=this.source.width=this.source.height=this.linesCanvas.width=this.linesCanvas.height=this.lightCanvas.width=this.lightCanvas.height=size;this.cacheKey='';}
      const span=lens.span||600,scale=size/span,cx=lens.x*W,cy=lens.y*H,ctx=this.source.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,size,size);ctx.setTransform(scale,0,0,scale,size/2-cx*scale,size/2-cy*scale);
      const key=[cx,cy,span,size].join(',');
      if(key!==this.cacheKey){const c=this.linesCanvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,size,size);c.setTransform(scale,0,0,scale,size/2-cx*scale,size/2-cy*scale);scene.lines(c);const light=this.lightCanvas.getContext('2d');light.setTransform(1,0,0,1,0,0);light.clearRect(0,0,size,size);light.setTransform(scale,0,0,scale,size/2-cx*scale,size/2-cy*scale);scene.lines(light,true);this.cacheKey=key;}
      const f=frame(state,now);
      if(f.base<1)scene.awaken(ctx,f.base,state.reducedMotion);
      else {ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(this.linesCanvas,0,0);ctx.restore();}
      scene.draw(ctx,state,now,{skipBase:true});
      ctx.setTransform(1,0,0,1,0,0);
      const glow=this.glow||(this.glow=document.createElement('canvas'));if(glow.width!==size)glow.width=glow.height=size;
      const g=glow.getContext('2d');g.clearRect(0,0,size,size);
      // Slow overlapping caustics illuminate only existing strokes. Sharp ink
      // remains cached underneath; the light never changes scene visibility.
      const phase=state.reducedMotion?.38:(now%8000)/8000;
      for(let i=0;i<2;i++){
        const t=(phase+i*.5)%1,radius=(.12+t*1.3)*size,band=size*.19;
        const gradient=g.createRadialGradient(size*.37,size*.42,Math.max(0,radius-band),size*.37,size*.42,radius+band);
        gradient.addColorStop(0,'rgba(255,222,168,0)');gradient.addColorStop(.5,`rgba(255,231,185,${.62*Math.sin(t*Math.PI)})`);gradient.addColorStop(1,'rgba(255,222,168,0)');
        g.fillStyle=gradient;g.fillRect(0,0,size,size);
      }
      g.globalCompositeOperation='destination-in';g.drawImage(this.lightCanvas,0,0);g.globalCompositeOperation='source-over';
      if(f.base===1){ctx.save();ctx.globalCompositeOperation='screen';ctx.filter='blur(2.3px)';ctx.drawImage(glow,0,0);ctx.filter='none';ctx.globalAlpha=.55;ctx.drawImage(glow,0,0);ctx.restore();}
      if(this.gl){const gl=this.gl;if(this.glCanvas.width!==size)this.glCanvas.width=this.glCanvas.height=size;gl.viewport(0,0,size,size);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.source);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);this.ctx.drawImage(this.glCanvas,0,0);}
      else {const c=this.ctx;c.clearRect(0,0,size,size);c.save();c.beginPath();c.arc(size/2,size/2,size/2,0,Math.PI*2);c.clip();c.drawImage(this.source,0,0);c.restore();}
    }
    dispose(){if(this.gl){for(const [type,obj] of [['Texture',this.texture],['Buffer',this.buffer],['Program',this.program],['Shader',this.vs],['Shader',this.fs]])if(obj)this.gl['delete'+type](obj);}this.source.width=this.linesCanvas.width=this.lightCanvas.width=1;if(this.glow)this.glow.width=1;}
  }
  const api={W,H,clamp,ease,duration,frame,transition,geo,affine,Scene,Lens,lensRadius};root.ArtworkCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
