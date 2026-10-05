/* Persistent WebGL2 presentation. Physics and flow geometry remain in CFD/CFDVisuals. */
(function(root) {
  'use strict';
  const vertex = `#version 300 es
  precision highp float;
  layout(location=0) in vec4 endpoints;
  layout(location=1) in float edgeIndex;
  uniform vec2 viewport;
  uniform float width;
  uniform bool facade;
  uniform sampler2D edges;
  out vec2 pixel;
  void main() {
    int id=int(edgeIndex); int tw=textureSize(edges,0).x;
    vec4 e=facade?texelFetch(edges,ivec2(id%tw,id/tw),0):endpoints;
    vec2 delta=e.zw-e.xy;
    float len=length(delta);
    vec2 tangent=len>0.000001?delta/len:vec2(1,0);
    vec2 normal=vec2(-tangent.y,tangent.x);
    int v=gl_VertexID;
    vec2 p;
    if(v<6) {
      int c=v==0?0:v==1?1:v==2?2:v==3?2:v==4?1:3;
      p=(c<2?e.xy:e.zw)+normal*(c%2==0?-0.5:0.5)*width;
    } else {
      int k=v-6; int end=k/36; int sector=(k%36)/3; int corner=k%3;
      float angle=6.28318530718*float(sector+(corner==2?1:0))/12.0;
      p=(end==0?e.xy:e.zw)+(corner==0?vec2(0):vec2(cos(angle),sin(angle))*width*0.5);
    }
    pixel=p; gl_Position=vec4(p/viewport*vec2(2,-2)+vec2(-1,1),0,1);
  }`;
  const stroke = `#version 300 es
  precision highp float;
  in vec2 pixel;
  uniform vec4 color;
  uniform bool masked;
  uniform sampler2D solid;
  uniform vec2 origin;
  uniform float cell;
  out vec4 result;
  void main(){
    if(masked && texelFetch(solid,ivec2(floor(pixel/cell+origin)),0).r>0.5)discard;
    result=vec4(color.rgb*color.a,color.a);
  }`;
  const quad = `#version 300 es
  precision highp float;
  uniform vec2 viewport;
  uniform vec2 extent;
  out vec2 pixel;
  void main(){vec2 p=vec2(gl_VertexID==1?2:0,gl_VertexID==2?2:0)*extent;
    pixel=p;gl_Position=vec4(p/viewport*vec2(2,-2)+vec2(-1,1),0,1);}`;
  const heat = `#version 300 es
  precision highp float;
  in vec2 pixel;
  uniform sampler2D ux;
  uniform sampler2D uy;
  uniform sampler2D solid;
  uniform sampler2D palette;
  uniform vec2 origin;
  uniform vec2 extent;
  uniform float cell;
  uniform float speedScale;
  uniform float maximum;
  uniform float opacity;
  out vec4 result;
  void main(){
    if(any(greaterThanEqual(pixel,extent)))discard;
    ivec2 n=ivec2(floor(pixel/cell+origin));
    if(texelFetch(solid,n,0).r>0.5)discard;
    float speed=length(vec2(texelFetch(ux,n,0).r,texelFetch(uy,n,0).r))*speedScale;
    int i=int(clamp(floor(speed*255.0/maximum+0.5),0.0,255.0));
    result=vec4(texelFetch(palette,ivec2(i,0),0).rgb*opacity,opacity);
  }`;
  function program(gl, vs, fs) {
    const p=gl.createProgram(), shaders=[];
    try {
      for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){
        const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
        gl.attachShader(p,s);
      }
      gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
      return p;
    }catch(e){gl.deleteProgram(p);throw e;}finally{shaders.forEach(s=>gl.deleteShader(s));}
  }
  class Renderer {
    constructor(canvas, field, visuals, settings, profiling=false) {
      this.canvas=canvas;this.field=field;this.visuals=visuals;this.settings=settings;
      const gl=this.gl=canvas.getContext('webgl2',{alpha:true,antialias:true,stencil:true,premultipliedAlpha:true,depth:false});
      if(!gl || !gl.getContextAttributes().stencil || !gl.getContextAttributes().antialias)throw Error('WebGL2 with stencil and antialiasing is unavailable');
      this.textures=[];this.buffers=[];this.programs=[];this.pending=[];this.completed=0;
      this.timer=profiling?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
      this.strokeProgram=program(gl,vertex,stroke);this.programs.push(this.strokeProgram);
      this.heatProgram=program(gl,quad,heat);this.programs.push(this.heatProgram);
      this.locations=new Map();
      this.capacities=new Map();
      const g=field;
      this.mask=this.texture(g.nx,g.ny,gl.R8,gl.RED,gl.UNSIGNED_BYTE,Uint8Array.from(g.solid,x=>x?255:0));
      this.u=this.texture(g.nx,g.ny,gl.R32F,gl.RED,gl.FLOAT,null);
      this.v=this.texture(g.nx,g.ny,gl.R32F,gl.RED,gl.FLOAT,null);
      this.palette=this.texture(256,1,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,null);
      const edges=visuals.facades.edges;
      this.edgeWidth=Math.min(Math.max(1,edges.length),gl.getParameter(gl.MAX_TEXTURE_SIZE));
      const data=new Float32Array(this.edgeWidth*Math.max(1,Math.ceil(edges.length/this.edgeWidth))*4);
      edges.forEach((e,i)=>data.set([(e.a.x-g.x0)*g.cellSize,(e.a.y-g.y0)*g.cellSize,(e.b.x-g.x0)*g.cellSize,(e.b.y-g.y0)*g.cellSize],i*4));
      this.edges=this.texture(this.edgeWidth,data.length/4/this.edgeWidth,gl.RGBA32F,gl.RGBA,gl.FLOAT,data);
      this.flowBuffer=this.buffer();this.edgeBuffer=this.buffer();
      this.flowData=new Float32Array(4096);this.edgeData=new Float32Array(edges.length);
      this.edgeBins=Array.from({length:16},()=>[]);
      this.flowRanges=[];this.edgeRanges=[];this.lastHeat=-Infinity;this.configure(settings);
    }
    buffer(){const b=this.gl.createBuffer();this.buffers.push(b);return b;}
    upload(buffer,data){
      const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      if((this.capacities.get(buffer)||0)<data.byteLength){const capacity=Math.max(4096,2**Math.ceil(Math.log2(data.byteLength)));gl.bufferData(gl.ARRAY_BUFFER,capacity,gl.DYNAMIC_DRAW);this.capacities.set(buffer,capacity);}
      if(data.byteLength)gl.bufferSubData(gl.ARRAY_BUFFER,0,data);
    }
    texture(w,h,internal,format,type,data){
      const gl=this.gl,t=gl.createTexture();this.textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,internal,w,h,0,format,type,data);return t;
    }
    location(p,n){let m=this.locations.get(p);if(!m)this.locations.set(p,m=new Map());if(!m.has(n))m.set(n,this.gl.getUniformLocation(p,n));return m.get(n);}
    bind(p,n,t,unit){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(this.location(p,n),unit);}
    configure(settings){
      this.settings=settings;this.lastHeat=-Infinity;
      this.flowRanges.length=0;
      const gl=this.gl,data=new Uint8Array(1024);
      for(let i=0;i<256;i++)data.set([...CFD.speedColor(i*settings.colorMaxMps/255,settings.palette,settings.colorMaxMps),255],i*4);
      gl.bindTexture(gl.TEXTURE_2D,this.palette);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,1,gl.RGBA,gl.UNSIGNED_BYTE,data);
    }
    common(p){
      const gl=this.gl,g=this.field;gl.useProgram(p);
      gl.uniform2f(this.location(p,'viewport'),this.canvas.width,this.canvas.height);
      gl.uniform2f(this.location(p,'origin'),g.x0,g.y0);gl.uniform1f(this.location(p,'cell'),g.cellSize);
      this.bind(p,'solid',this.mask,0);
    }
    poll(){
      const gl=this.gl,results=[];
      if(this.timer && gl.getParameter(this.timer.GPU_DISJOINT_EXT)){
        for(const f of this.pending){if(f.query)gl.deleteQuery(f.query);f.query=null;}
      }
      while(this.pending.length){
        const f=this.pending[0],state=gl.clientWaitSync(f.sync,0,0);
        if(state===gl.WAIT_FAILED)throw Error('Wind GPU completion fence failed');
        if(state===gl.TIMEOUT_EXPIRED)break;
        if(f.query && !gl.getQueryParameter(f.query,gl.QUERY_RESULT_AVAILABLE))break;
        this.pending.shift();gl.deleteSync(f.sync);this.completed++;
        results.push({frameId:f.id,completionLatencyMs:performance.now()-f.started,...(f.query?{gpuMs:gl.getQueryParameter(f.query,gl.QUERY_RESULT)/1e6}:{})});
        if(f.query)gl.deleteQuery(f.query);
      }
      return results;
    }
    clear(){const gl=this.gl;gl.clearColor(0,0,0,0);gl.stencilMask(255);gl.clear(gl.COLOR_BUFFER_BIT|gl.STENCIL_BUFFER_BIT);}
    draw(now,frameId,profile,prepared){
      const gl=this.gl,g=this.field,v=this.visuals,s=this.settings;
      const query=this.timer?gl.createQuery():null,started=performance.now();
      if(query)gl.beginQuery(this.timer.TIME_ELAPSED_EXT,query);
      gl.viewport(0,0,this.canvas.width,this.canvas.height);this.clear();
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.STENCIL_TEST);
      const p=this.heatProgram;this.common(p);
      this.bind(p,'ux',this.u,1);this.bind(p,'uy',this.v,2);this.bind(p,'palette',this.palette,3);
      if(now-this.lastHeat>50){
        for(const [t,data] of [[this.u,g.ux],[this.v,g.uy]]){gl.bindTexture(gl.TEXTURE_2D,t);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,g.nx,g.ny,gl.RED,gl.FLOAT,data);}
        // Uploads use the currently active unit; restore palette binding.
        this.bind(p,'palette',this.palette,3);this.lastHeat=now;
      }
      gl.uniform2f(this.location(p,'extent'),g.vw*g.cellSize,g.vh*g.cellSize);
      gl.uniform1f(this.location(p,'speedScale'),g.windSpeed/g.latticeSpeed);gl.uniform1f(this.location(p,'maximum'),s.colorMaxMps);
      gl.uniform1f(this.location(p,'opacity'),.2*(s.visualStyle==='particles'?.45:1));gl.drawArrays(gl.TRIANGLES,0,3);
      if(prepared){
        this.flowRanges.length=0;let offset=0;
        prepared.counts.forEach((count,i)=>{if(count)this.flowRanges.push([i,offset,count]);offset+=count;});
        this.upload(this.flowBuffer,prepared.vertices.subarray(0,offset*4));
      }else if(!v.externalFlowUpdates){
        const collectStart=profile?performance.now():0;v.collectSegments();
        if(profile)profile.collectMs=performance.now()-collectStart;
        let length=0;for(const b of v.buckets)length+=b.length;
        if(length>this.flowData.length)this.flowData=new Float32Array(Math.max(length,this.flowData.length*2));
        this.flowRanges.length=0;let offset=0;
        for(let i=0;i<v.buckets.length;i++){const b=v.buckets[i];if(!b.length)continue;this.flowData.set(b,offset);this.flowRanges.push([i,offset/4,b.length/4]);offset+=b.length;}
        this.upload(this.flowBuffer,this.flowData.subarray(0,length));
      }
      const sp=this.strokeProgram;this.common(sp);gl.uniform1i(this.location(sp,'facade'),0);gl.uniform1i(this.location(sp,'masked'),1);
      this.bind(sp,'edges',this.edges,1);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.flowBuffer);
      gl.enableVertexAttribArray(0);gl.vertexAttribDivisor(0,1);gl.disableVertexAttribArray(1);
      gl.enable(gl.STENCIL_TEST);gl.stencilOp(gl.KEEP,gl.KEEP,gl.REPLACE);let reference=0;
      const strokeBucket=(count,color,width)=>{
        if(++reference===256){gl.clear(gl.STENCIL_BUFFER_BIT);reference=1;}
        // One coverage per sample per Canvas-style path, including self intersections.
        gl.stencilFunc(gl.NOTEQUAL,reference,255);gl.uniform4fv(this.location(sp,'color'),color);gl.uniform1f(this.location(sp,'width'),width);
        gl.drawArraysInstanced(gl.TRIANGLES,0,78,count);
      };
      for(const [i,start,count] of this.flowRanges){
        const style=v.strokeStyle(i);gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,start*16);
        strokeBucket(count,[style.rgb[0]/255,style.rgb[1]/255,style.rgb[2]/255,style.alpha],style.width);
      }
      if(s.facadeGlow){
        for(const b of this.edgeBins)b.length=0;
        v.facades.edges.forEach((e,i)=>{if(e.intensity>=.01)this.edgeBins[Math.min(15,Math.floor(Math.sqrt(e.intensity)*16))].push(i);});
        let n=0;this.edgeRanges.length=0;
        this.edgeBins.forEach((b,i)=>{if(b.length){this.edgeData.set(b,n);this.edgeRanges.push([i,n,b.length]);n+=b.length;}});
        this.upload(this.edgeBuffer,this.edgeData.subarray(0,n));
        gl.disableVertexAttribArray(0);gl.enableVertexAttribArray(1);gl.vertexAttribDivisor(1,1);
        gl.uniform1i(this.location(sp,'facade'),1);gl.uniform1i(this.location(sp,'masked'),0);
        const layers=s.palette==='monochrome'?[[16,.28,[230,230,230]],[7,.6,[245,245,245]],[2,1,[255,255,255]]]:[[16,.28,[255,159,67]],[7,.6,[255,194,105]],[2,1,[255,245,219]]];
        for(const [width,alpha,rgb] of layers)for(const [i,start,count] of this.edgeRanges){
          gl.vertexAttribPointer(1,1,gl.FLOAT,false,4,start*4);strokeBucket(count,[...rgb.map(x=>x/255),alpha*(i+.5)/16],width*(this.field.renderScale||1));
        }
      }
      gl.disableVertexAttribArray(0);gl.disableVertexAttribArray(1);gl.disable(gl.STENCIL_TEST);
      if(query)gl.endQuery(this.timer.TIME_ELAPSED_EXT);
      this.pending.push({id:frameId,started,query,sync:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0)});gl.flush();
    }
    dispose(){
      const gl=this.gl;for(const p of this.pending){gl.deleteSync(p.sync);if(p.query)gl.deleteQuery(p.query);}this.pending.length=0;
      this.textures.forEach(t=>gl.deleteTexture(t));this.buffers.forEach(b=>gl.deleteBuffer(b));this.programs.forEach(p=>gl.deleteProgram(p));
    }
  }
  root.CFDGPU={Renderer};
})(typeof self!=='undefined'?self:globalThis);
