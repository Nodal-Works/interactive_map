(function() {
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  function node(tag,attrs={},text) {const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
  function merc(c) {const lat=c[1]*Math.PI/180;return [(c[0]+180)/360,(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2];}
  function normalized(c,table) {
    const p=merc(c), a=merc(table.corners[0]), b=merc(table.corners[1]), d=merc(table.corners[3]);
    const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-a[0],vy=d[1]-a[1],det=ux*vy-uy*vx;
    return {x:((p[0]-a[0])*vy-(p[1]-a[1])*vx)/det,y:(ux*(p[1]-a[1])-uy*(p[0]-a[0]))/det};
  }
  class CompanionMap {
    constructor({element,map,send,identity,desktop=false}) {
      this.element=element;this.send=send;this.identity=identity;this.desktop=desktop;
      this.objects=[];this.drafts=[];this.tool='off';this.color='#38bdf8';this.width=3;this.pointers=new Set();this.selected=null;
      this.map=map || new maplibregl.Map({container:element,style:{version:8,sources:{base:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}},layers:[{id:'base',type:'raster',source:'base',paint:{'raster-saturation':-1,'raster-contrast':-.2,'raster-brightness-min':.25}}]},center:[11.9777,57.6884],zoom:16,attributionControl:true});
      this.svg=node('svg',{'class':'mr-map-overlay','aria-hidden':'true'});
      (desktop?document.body:element).append(this.svg);
      if(desktop)this.svg.classList.add('desktop');
      this.map.on('move',()=>this.render());this.map.on('resize',()=>this.render());
      this.map.on('load',()=>{this.ready=true;if(this.table)this.fit();this.render();});
      this.ready=this.map.loaded();
      this.element.addEventListener('pointerdown',e=>this.down(e),true);
      this.element.addEventListener('pointermove',e=>this.move(e),true);
      this.element.addEventListener('pointerup',e=>this.up(e),true);
      this.element.addEventListener('pointercancel',e=>{this.pointers.delete(e.pointerId);this.cancel();},true);
      // MapLibre also listens to legacy mouse/touch events. Keep single-finger
      // editing separate from its navigation handlers while allowing pinch/pan.
      for(const type of ['touchstart','touchmove','touchend','mousedown','dblclick'])this.element.addEventListener(type,e=>{
        if(this.desktop&&(this.tool==='off'||!this.identity()?.canEdit))return;
        if(e.touches?.length>1)this.navigatingTouch=true;
        if(this.navigatingTouch&&(e.touches?.length>1||type==='touchend')){if(e.touches.length===0)this.navigatingTouch=false;return;}
        if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();
      },{capture:true,passive:false});
    }
    setTool(tool) {
      this.cancel();this.tool=tool;const navigating=['navigate','off'].includes(tool);
      this.element.style.cursor=navigating?'grab':'crosshair';
      this.map.doubleClickZoom[this.desktop&&navigating?'enable':'disable']();
      if(!this.desktop){this.map.dragPan.enable();this.map.touchZoomRotate.disableRotation();this.map.dragRotate.disable();this.map.touchPitch?.disable();this.map.scrollZoom.disable();this.map.keyboard.disable();}
      this.element.dispatchEvent(new CustomEvent('mr-tool-state',{detail:{tool}}));
    }
    setState(state) {
      if(this.table && state.table?.revision!==this.table.revision)this.cancel();
      this.table=state.table;this.objects=state.objects||[];this.layers=state.layers||{};this.drafts=state.drafts||[];
      if(!this.didFit&&this.table&&!this.desktop){this.fit();this.didFit=true;}
      this.render();
    }
    fit() {
      if(!this.table||this.desktop)return;
      const bounds=new maplibregl.LngLatBounds();this.table.corners.forEach(c=>bounds.extend(c));
      this.map.resize();this.map.fitBounds(bounds,{padding:25,bearing:this.table.bearing,duration:0});
    }
    project(c) {const p=this.map.project(c);if(this.desktop){const r=this.element.getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top};}return p;}
    location(e) {const r=this.element.getBoundingClientRect();return this.map.unproject([e.clientX-r.left,e.clientY-r.top]).toArray();}
    within(c) {if(!this.table)return false;const p=normalized(c,this.table);return p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;}
    hit(c) {
      const p=this.project(c);let best=null,dist=24;
      for(const object of [...this.objects].reverse())for(let i=0;i<object.points.length;i++) {
        if(object.tool==='obstacle'?!this.layers['cfd-simulation-btn']:!this.layers['canvas-btn'])continue;
        if(this.layer==='cfd-simulation-btn'&&object.tool!=='obstacle')continue;
        if(!this.desktop&&object.creatorId!==this.identity()?.id)continue;
        const q=this.project(object.points[i]),d=Math.hypot(q.x-p.x,q.y-p.y);
        if(d<dist){best={object,index:i};dist=d;}
      }
      return best;
    }
    down(e) {
      if(e.button && e.button!==0)return;
      this.pointers.add(e.pointerId);
      if(this.pointers.size>1){this.gesture=null;if(!this.polygon&&this.identity()?.canEdit)this.send({type:'draft',object:null});this.render();return;}
      if(this.tool==='navigate'||this.tool==='off'||!this.identity()?.canEdit)return;
      const coordinate=this.location(e);if(!this.within(coordinate))return;
      this.element.setPointerCapture(e.pointerId);
      const drawing=['pen','line','arrow','marker','comment','polygon','obstacle'].includes(this.tool);
      if(['select','reshape'].includes(this.tool)) {
        const hit=this.hit(coordinate);this.selected=hit?.object.id||null;
        if(hit)this.gesture={original:structuredClone(hit.object),object:structuredClone(hit.object),coordinate,vertex:this.tool==='reshape'?hit.index:null};
        this.render();return;
      }
      if(!drawing){this.gesture={coordinate,point:true,started:performance.now()};this.render();return;}
      if(['polygon','obstacle'].includes(this.tool)) {
        this.gesture={corner:coordinate};return;
      }
      this.gesture={object:this.newObject([coordinate]),coordinate};
      this.render();
    }
    newObject(points) {return{tool:this.tool,points,color:this.color,width:Number(this.width),text:''};}
    move(e) {
      if(!this.pointers.has(e.pointerId)||this.pointers.size!==1||!this.gesture)return;
      const c=this.location(e);if(!this.within(c))return;
      const g=this.gesture;
      if(g.original) {
        const origin=this.map.project(g.coordinate),now=this.map.project(c);
        g.object.points=g.original.points.map((p,i)=>{
          if(g.vertex!==null)return i===g.vertex?c:p;
          const q=this.map.project(p);return this.map.unproject([q.x+now.x-origin.x,q.y+now.y-origin.y]).toArray();
        });
      } else if(g.object) {
        if(this.tool==='pen'){const a=this.project(g.object.points.at(-1)),b=this.project(c);if(g.object.points.length<2000&&Math.hypot(a.x-b.x,a.y-b.y)>=2)g.object.points.push(c);}
        else if(['line','arrow'].includes(this.tool))g.object.points=[g.coordinate,c];
      } else if(g.point){g.coordinate=c;if(['viewer','heading'].includes(this.tool)&&performance.now()-g.started>120)this.mapGesture(c,'move');this.render();}
      if(g.object)this.preview(g.object);
    }
    up(e) {
      this.pointers.delete(e.pointerId);
      if(!this.gesture)return;
      const g=this.gesture;this.gesture=null;
      if(g.corner){
        if(this.polygon?.points.length>=3&&Math.hypot(this.project(g.corner).x-this.project(this.polygon.points[0]).x,this.project(g.corner).y-this.project(this.polygon.points[0]).y)<20){this.finish();return;}
        if(!this.polygon)this.polygon=this.newObject([g.corner]);else this.polygon.points.push(g.corner);
        this.preview(this.polygon);
      } else if(g.object) {
        if(g.object.tool==='comment'&&!g.original){const text=prompt('Comment on this place');if(!text){this.cancel();return;}g.object.text=text.slice(0,500);}
        this.send({type:'canvas',operation:g.original?'update':'create',objectId:g.original?.id||MR.id(),object:g.object});
        this.send({type:'draft',object:null});
      } else if(g.point){const c=this.location(e);if(this.within(c))this.mapGesture(c,'up');}
      this.render();
    }
    mapGesture(c,phase) {
      if(phase==='move'&&performance.now()-(this.lastMove||0)<100)return;
      this.lastMove=performance.now();this.lastInput={layer:this.layer,coordinate:c};
      const p=normalized(c,this.table);
      this.send({type:'gesture',layer:this.layer,tool:this.tool,phase,transform:this.table.revision,...p});
    }
    preview(object) {
      this.render();
      if(performance.now()-(this.lastDraft||0)<300)return;
      this.lastDraft=performance.now();
      // Incomplete polygons are kept on the creating phone until they are valid.
      if(MR.validObject(object)){const step=Math.max(1,Math.ceil(object.points.length/100));const points=object.points.filter((_,i)=>i%step===0||i===object.points.length-1);this.send({type:'draft',object:{...object,points}});}
    }
    finish() {if(this.polygon?.points.length>=3){this.send({type:'canvas',operation:'create',objectId:MR.id(),object:this.polygon});this.cancel();}}
    cancel() {this.gesture=null;this.polygon=null;if(this.identity()?.canEdit)this.send({type:'draft',object:null});this.render();}
    remove() {if(this.selected){this.send({type:'canvas',operation:'delete',objectId:this.selected});this.selected=null;}}
    editText() {const object=this.objects.find(o=>o.id===this.selected&&o.tool==='comment');if(!object)return;const text=prompt('Edit comment',object.text);if(text!==null)this.send({type:'canvas',operation:'update',objectId:object.id,object:{...object,text:text.slice(0,500)}});}
    render() {
      if(!this.svg)return;
      this.svg.replaceChildren();
      const defs=node('defs'), marker=node('marker',{id:this.desktop?'host-arrow':'phone-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});
      marker.append(node('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'}));defs.append(marker);this.svg.append(defs);
      if(this.table&&!this.desktop){const pts=this.table.corners.map(c=>{const p=this.project(c);return`${p.x},${p.y}`;}).join(' ');this.svg.append(node('polygon',{points:pts,fill:'none',stroke:'#ffffff66','stroke-width':1,'stroke-dasharray':'5 5'}));}
      const input=this.gesture?.point?this.gesture.coordinate:this.lastInput&&this.lastInput.layer===this.layer?this.lastInput.coordinate:null;
      if(input&&!this.desktop){const p=this.project(input);this.svg.append(node('circle',{cx:p.x,cy:p.y,r:7,fill:'#0f766e',stroke:'#fff','stroke-width':3}));}
      const all=[...this.objects,...this.drafts.filter(d=>d.creatorId!==this.identity()?.id).map(d=>({...d,draft:true}))];
      if(this.gesture?.object)all.push({...this.gesture.object,draft:true});
      if(this.polygon)all.push({...this.polygon,draft:true});
      this.element.dispatchEvent(new CustomEvent('mr-drawing-state',{detail:{corners:this.polygon?.points.length||0,selected:!!this.selected}}));
      for(const o of all) {
        if(!o.draft&&o.tool!=='obstacle'&&!this.layers?.['canvas-btn'])continue;
        if(o.tool==='obstacle'&&!this.layers?.['cfd-simulation-btn'])continue;
        if(!o.draft&&this.gesture?.original && this.gesture.original.id===o.id)continue;
        const pts=o.points.map(c=>this.project(c)),str=pts.map(p=>`${p.x},${p.y}`).join(' '),first=pts[0];if(!first)continue;
        const group=node('g',{'opacity':o.draft?.85:1});
        group.append(node(['polygon','obstacle'].includes(o.tool)?'polygon':'polyline',{points:str,fill:['polygon','obstacle'].includes(o.tool)?o.color+'44':'none',stroke:o.color,'stroke-width':o.width,'stroke-linecap':'round','stroke-linejoin':'round',...(o.tool==='arrow'?{'marker-end':`url(#${this.desktop?'host-arrow':'phone-arrow'})`}:{})}));
        if(['marker','comment'].includes(o.tool))group.append(node('circle',{cx:first.x,cy:first.y,r:6,fill:o.color,stroke:'#fff','stroke-width':2}));
        if(o.tool==='pen'&&pts.length===1)group.append(node('circle',{cx:first.x,cy:first.y,r:o.width/2,fill:o.color}));
        if(o.tool==='comment')group.append(node('text',{x:first.x+10,y:first.y-10,fill:o.color,stroke:'#0b111c','stroke-width':4,'paint-order':'stroke','font-size':14},o.text));
        if(o.id===this.selected||o.draft&&['polygon','obstacle'].includes(o.tool))pts.forEach(p=>group.append(node('circle',{cx:p.x,cy:p.y,r:5,fill:'#fff',stroke:o.color,'stroke-width':2})));
        group.append(node('title',{},o.creatorName||'Drawing'));this.svg.append(group);
      }
    }
  }
  window.MR_MAP={CompanionMap,normalized};
})();
