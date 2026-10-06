/* Shared, DOM-free exhibit explanations and elapsed-trip interpolation. */
(function(root){
  'use strict';
  const DEFINITIONS={
    'synthpop-heatmap-btn':{key:'synthpop',title:'Synth Pop Heatmap',question:'Who pays for a slower walk?',
      description:'Synthetic residents aged 75+ travel from home to Sahlgrenska. Colour shows average extra travel minutes when walking at 4.235 instead of 4.8 km/h.',
      note:'These are modelled healthcare trips, not tracked people. Walking times use the source model’s distance assumptions.'},
    'slow-walkers-btn':{key:'slow_walkers',title:'Time Lost by Slow Walkers',question:'A slower walk. A longer wait?',
      description:'A walk at 4.235 instead of 4.8 km/h can mean missing a bus or tram connection. Colour shows average extra minutes on trips classified by the model as missed connections.',
      note:'Prepared timetable samples, not live transport or an all-day result. Smaller colour cells interpolate routing origins; they do not add routing coverage.'}
  };
  // Fixed scales across departures. Presentation colours never change data values.
  const PALETTES={
    synthpop:['#548ba5','#55c4b8','#c6df94','#ffca70','#f48166','#d64d78'],
    slow_walkers:['#283d70','#377ba0','#56c4b5','#f2d990','#f49666','#d95366','#8f365c']
  };
  function palette(key,metadata){
    const expected=key==='synthpop'?[0,.5,1,2,5,10]:[0,5,10,15,20,25,30];
    return JSON.stringify(metadata.bins)===JSON.stringify(expected)?PALETTES[key]:metadata.colors;
  }
  // Inset rounded glyphs for occupied cells. Keep the analytical geometry intact.
  function displayCells(collection){
    return {...collection,features:collection.features.map(feature=>{
      if(feature.geometry?.type!=='Polygon'||feature.geometry.coordinates.length!==1)return feature;
      const ring=feature.geometry.coordinates[0].slice(0,-1);if(ring.length<3)return feature;
      const center=ring.reduce((a,p)=>[a[0]+p[0]/ring.length,a[1]+p[1]/ring.length],[0,0]);
      const points=ring.map(p=>p.map((v,i)=>center[i]+(v-center[i])*.94)),rounded=[];
      for(let i=0;i<points.length;i++){
        const p=points[i],previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
        const a=p.map((v,j)=>v+(previous[j]-v)*.13),b=p.map((v,j)=>v+(next[j]-v)*.13);
        for(let step=0;step<=4;step++){const t=step/4;rounded.push(p.map((v,j)=>(1-t)**2*a[j]+2*(1-t)*t*v+t*t*b[j]));}
      }
      rounded.push(rounded[0]);return {...feature,geometry:{type:'Polygon',coordinates:[rounded]}};
    })};
  }
  function story(state){
    const synth=state?.key==='synthpop',stats=state?.statistics||{},journeys=synth&&state.view==='journeys';
    const trips=stats.localRoutedTrips,residents=stats.localRoutedResidents??stats.localResidents,qualifying=stats.qualifyingTrips;
    const top=state?.maximumDistrict,times=state?.departures||[];
    return {
      chapter:synth?'02 / Trips to hospital':'01 / The cost of a missed connection',
      question:synth?'Who pays for a slower walk?':'A slower walk. A longer wait?',
      intro:synth?'The same home. The same hospital. Two walking speeds.':'A slightly slower walk can mean missing a bus or tram. The extra wait can outweigh the extra walking time.',
      metric:synth?(Number.isFinite(trips)&&trips>0&&Number.isFinite(qualifying)?Math.round(qualifying/trips*100)+'%':'—'):(Number.isFinite(top?.value)?top.value.toFixed(1)+' min':'—'),
      metricLabel:synth?'of these healthcare trips gain more than 1 minute':'highest neighbourhood average in this view',
      detail:synth?(Number.isFinite(trips)?`${qualifying??0} of ${trips.toLocaleString()} trips · ${(residents??0).toLocaleString()} synthetic residents aged 75+.`:'Preparing the local healthcare cohort…'):(top?`${top.name} · sampled origins inside the table only.`:'Preparing the neighbourhood summaries…'),
      view:journeys?`${((state.timeSeconds||0)/60).toFixed(1)} min since departure`:synth?'Healthcare trips · '+(state.sampling?.split(' · ').at(-1)||'recorded departures'):state?.departure>=0?`Departure ${times[state.departure]||'—'}`:`${state?.completedDepartures??'—'} morning samples · average`,
      legendTitle:journeys?'Same journey, two walking speeds':synth?'Extra minutes · all healthcare trips':'Extra minutes · missed connections only',
      reading:journeys?'Departures are aligned to compare elapsed time. Rings mark waiting; counters show arrivals at Sahlgrenska.':synth?`${stats.displaySpacingMetres||200} m cells average trips from sampled homes. Empty areas have no sampled homes.`:'Colours average only trips classified by the model as missed connections, not every trip. The scale stays fixed as time changes.',
      prompt:journeys?'Watch the gap between the arrival counts grow.':synth?'On your phone, choose Journeys and press Play.':'On your phone, change departure time. Where does the delay move?',
      footnote:synth?'Modelled residents, not tracked people. Destination: Sahlgrenska.':`${state?.sampling||'Morning departures only'}. ${state?.routingDate?'Timetable: '+state.routingDate+'. ':''}Modelled travel, not live traffic.`
    };
  }
  function position(track,time){
    if(!track?.legs?.length)return {coordinate:null,waiting:false,arrived:true};
    let previous=track.legs[0].coordinates[0];
    for(const leg of track.legs){
      if(time<leg.start)return {coordinate:previous,waiting:true,arrived:false};
      const end=leg.start+leg.duration;
      if(time<end){
        const fraction=Math.max(0,Math.min(1,(time-leg.start)/leg.duration)),s=leg.stations,c=leg.coordinates;
        let lo=0,hi=s.length-1;
        while(hi-lo>1){const mid=(lo+hi)>>1;if(s[mid]<=fraction)lo=mid;else hi=mid;}
        const span=s[hi]-s[lo],u=span>0?(fraction-s[lo])/span:0;
        return {coordinate:[c[lo][0]+(c[hi][0]-c[lo][0])*u,c[lo][1]+(c[hi][1]-c[lo][1])*u],waiting:false,arrived:false};
      }
      previous=leg.coordinates.at(-1);
    }
    return {coordinate:previous,waiting:false,arrived:true};
  }
  function legend(bins,colors,mode){return bins.map((low,i)=>({color:colors[i],label:i===bins.length-1?`${low}+ min`:mode==='continuous'?`${low} min`:`${low}–${bins[i+1]} min`}));}
  function colorExpression(bins,colors,mode){
    if(mode==='continuous')return ['interpolate',['linear'],['get','delay'],...bins.flatMap((value,i)=>[value,colors[i]])];
    return ['step',['get','delay'],colors[0],...bins.slice(1).flatMap((value,i)=>[value,colors[i+1]])];
  }
  function note(state){
    if(state?.note)return state.note;
    const metadata=state?.statistics||state||{},key=state?.key;
    if(metadata.note)return metadata.note;
    const date=metadata.routingDate?`Timetable date: ${metadata.routingDate}. `:'',sampling=metadata.sampling?`${metadata.sampling}. `:'';
    if(key==='synthpop')return date+sampling+DEFINITIONS['synthpop-heatmap-btn'].note;
    const spacing=metadata.originSpacingMetres,display=metadata.displaySpacingMetres,interpolation=metadata.interpolation;
    const grid=Number.isFinite(spacing)?`Routing origins are ${spacing} m apart within the table area. `:'';
    const cells=Number.isFinite(display)?`${display} m colour cells interpolate${interpolation?.neighbours?` up to ${interpolation.neighbours} valid origins`:''}${interpolation?.maximumMetres?` within ${interpolation.maximumMetres} m`:''}; they do not add routing coverage. `:'';
    return date+sampling+grid+cells+(key==='slow_walkers'?'Prepared timetable samples, not live transport or an all-day result.':DEFINITIONS['synthpop-heatmap-btn'].note);
  }
  function summary(state){
    if(!state?.ready)return 'Preparing the exhibit data…';
    if(state.key==='synthpop'){
      const stats=state.statistics||{},residents=stats.localRoutedResidents??stats.localResidents??0,failed=stats.failedPairs||0;
      if(state.view==='journeys')return `${stats.journeyTrips??stats.qualifyingTrips??0} healthcare trips with more than 1 minute extra · ${(state.timeSeconds/60).toFixed(1)} min since departure · Arrived: ${state.arrivals.medium} at 4.8 km/h, ${state.arrivals.slow} at 4.235 km/h. Departures are aligned to compare elapsed journey time.`;
      return `${(stats.localRoutedTrips??0).toLocaleString()} routed healthcare trips from ${residents.toLocaleString()} synthetic residents in the table area. Each occupied cell averages its trips; empty cells have no sampled homes.${failed?` ${failed} incomplete route pairs excluded from comparisons.`:''}${state.journeysAvailable===false?` ${state.journeyUnavailableReason||'No complete paired journeys lose more than one minute.'}`:''}`;
    }
    const selected=state.departure<0?'Average of available samples':`Departure ${state.departures[state.departure]}`;
    const top=state.maximumDistrict;
    const times=state.departures||[],scope=state.districtScope||state.statistics?.districtScope||'Sampled routing origins';
    return `${selected} · ${state.completedDepartures} of ${state.plannedDepartures} departures available${times.length?` (${times[0]}–${times.at(-1)})`:''}${top?` · Highest neighbourhood average: ${top.name}, ${top.value.toFixed(1)} min (${scope.toLowerCase()})`:''}. Missing routing results are transparent.`;
  }
  const api={DEFINITIONS,PALETTES,palette,displayCells,story,position,legend,colorExpression,note,summary};root.MR_MOBILITY_CORE=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
