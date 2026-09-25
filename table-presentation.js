/* Screen ornament sizes are physical table sizes; geographic coordinates are untouched. */
(function(root) {
  'use strict';
  let scale=1;
  root.mrTableScale=()=>scale;
  root.updateTablePresentation=function() {
    const d=root.MR_CALIBRATION.dimensions;
    const active=d.layoutMode && d.layoutMode!=='legacy';
    document.body.classList.toggle('physical-table',!!active);
    const t=root.getTableLayout(),p=root.MR_TABLE.presentation(d,t);
    scale=p.scale;
    const css=document.documentElement.style;
    for(const [key,value] of Object.entries({left:t.left,top:t.top,width:t.w,height:t.h,rail:p.rail}))
      css.setProperty('--table-'+key,value+'px');
    css.setProperty('--table-ui-scale',scale);
  };

  // Central policy for MapLibre's pixel-based marks (streets, selections, annotations,
  // isovists and slide outlines). Keep original values so resizing never compounds.
  const paint=new Set(['line-width','line-gap-width','line-blur','circle-radius','circle-blur',
    'circle-stroke-width','text-halo-width','text-halo-blur']);
  paint.delete('circle-blur'); // dimensionless fraction of the radius
  const layout=new Set(['text-size']);
  function scaled(value,factor) {
    if(typeof value==='number')return value*factor;
    if(!Array.isArray(value))return value;
    // Zoom expressions must remain top-level in the MapLibre expression grammar.
    const copy=value.slice();
    if(value[0]==='interpolate') {
      for(let i=4;i<copy.length;i+=2)copy[i]=scaled(copy[i],factor);
      return copy;
    }
    if(value[0]==='step') {
      for(let i=2;i<copy.length;i+=2)copy[i]=scaled(copy[i],factor);
      return copy;
    }
    return ['*',value,factor];
  }
  root.installTableMapScale=function(map) {
    const originals=new Map();
    const add=map.addLayer.bind(map),remove=map.removeLayer.bind(map);
    const setters={paint:map.setPaintProperty.bind(map),layout:map.setLayoutProperty.bind(map)};
    const remember=(id,kind,key,value)=>originals.set(JSON.stringify([id,kind,key]),{id,kind,key,value});
    map.addLayer=function(layer,...args) {
      const copy={...layer};
      for(const [kind,keys] of [['paint',paint],['layout',layout]]) {
        if(!layer[kind])continue;
        copy[kind]={...layer[kind]};
        for(const key of keys)if(key in copy[kind]) {
          remember(layer.id,kind,key,copy[kind][key]);
          copy[kind][key]=scaled(copy[kind][key],scale);
        }
      }
      return add(copy,...args);
    };
    map.removeLayer=function(id) {
      for(const [key,entry] of originals)if(entry.id===id)originals.delete(key);
      return remove(id);
    };
    for(const [kind,keys] of [['paint',paint],['layout',layout]]) {
      const name=kind==='paint'?'setPaintProperty':'setLayoutProperty';
      map[name]=function(id,key,value,...args) {
        if(keys.has(key)){remember(id,kind,key,value);value=scaled(value,scale);}
        return setters[kind](id,key,value,...args);
      };
    }
    return function refresh() {
      for(const {id,kind,key,value} of originals.values())
        if(map.getLayer(id))setters[kind](id,key,scaled(value,scale));
    };
  };
})(typeof window==='undefined'?globalThis:window);
