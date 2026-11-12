(function() {
  'use strict';
  if(new URLSearchParams(location.search).get('handTracking')!=='1')return;
  const panel=document.createElement('aside');panel.id='mr-hand-panel';
  panel.innerHTML=`<h2>Webcam hands · table test</h2>
    <button id="mr-hand-move-panel">Move camera controls to TV</button>
    <label>Camera<select id="mr-hand-camera"><option value="">Default camera</option></select></label>
    <button id="mr-hand-start">Start camera</button> <button id="mr-hand-stop" disabled>Stop</button>
    <div id="mr-hand-preview"><video autoplay playsinline muted></video><canvas width="640" height="480"></canvas></div>
    <button id="mr-hand-calibrate" disabled>Calibrate table corners</button>
    <details><summary>Adjust pointer alignment</summary>
      <label><input id="mr-hand-flip-x" type="checkbox"> Flip left / right</label>
      <label><input id="mr-hand-flip-y" type="checkbox"> Flip front / back</label>
      <label>Horizontal correction (cm)<input id="mr-hand-offset-x" type="number" min="-30" max="30" step="1" value="0"></label>
      <label>Vertical correction (cm)<input id="mr-hand-offset-y" type="number" min="-30" max="30" step="1" value="0"></label>
    </details>
    <details><summary>Keep marker clear of your hand</summary>
      <label>Marker direction<select id="mr-hand-marker-side"><option value="above">Above</option><option value="below">Below</option><option value="left">Left</option><option value="right">Right</option></select></label>
      <label>Marker distance (cm)<input id="mr-hand-marker-distance" type="number" min="4" max="30" step="2" value="12"></label>
    </details>
    <label>Action<select id="mr-hand-mode"><option value="pointer">Pointer only</option><option value="select">Select EPC building</option><option value="draw">Draw on table</option></select></label>
    <p>Open your hand to aim, then move your whole hand to steer. Pinch to select or draw; open to release.</p>
    <p>The large ring is the active drawing and selection tip. The projected hand shadow follows beside your real hand. EPC aim stays fixed while you pinch.</p>
    <p id="mr-hand-status" role="status">Start the camera, then calibrate. The map stays fixed.</p>
    <small>Camera frames stay in this browser. First use downloads the tracking model; internet is required.</small>`;
  document.body.append(panel);
  const find=id=>document.getElementById('mr-hand-'+id);
  const start=find('start'),stopButton=find('stop'),calibrateButton=find('calibrate'),mode=find('mode'),camera=find('camera'),status=find('status');
  const flipX=find('flip-x'),flipY=find('flip-y'),offsetX=find('offset-x'),offsetY=find('offset-y');
  const markerSide=find('marker-side'),markerDistance=find('marker-distance');
  const movePanel=find('move-panel');
  const video=panel.querySelector('video'),preview=panel.querySelector('canvas'),ctx=preview.getContext('2d');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='mr-hand-overlay';document.body.append(svg);
  const tracker=new MR_HAND_CORE.Tracker();
  let stream=null,detector=null,running=false,starting=false,frame=0,generation=0,lastFrame=-1,lastTime=0;
  let projection=null,corners=[],calibrating=false,stroke=null,lastPoint=null;
  const message=text=>status.textContent=text;
  function calibrationKey(){return 'mr-hand-calibration-v1:'+stream?.getVideoTracks()[0].getSettings().deviceId;}
  function calibrationLayout(){
    const table=MR_ADAPTER.table();
    return {width:video.videoWidth,height:video.videoHeight,widthCm:table.widthCm,heightCm:table.heightCm,
      points:MR_TABLE.geometry().points.map(p=>[Math.round(p.x),Math.round(p.y)])};
  }
  function saveCalibration(){
    if(!projection||corners.length!==4)return;
    try{window.localStorage.setItem(calibrationKey(),JSON.stringify({layout:calibrationLayout(),corners,
      flipX:!!flipX.checked,flipY:!!flipY.checked,offsetX:offsetX.value,offsetY:offsetY.value,
      markerSide:markerSide.value,markerDistance:markerDistance.value}));}catch(error){message('Calibration works for this session, but browser storage could not save it.');}
  }
  function restoreCalibration(){
    try{
      const saved=JSON.parse(window.localStorage.getItem(calibrationKey()));
      if(!saved||JSON.stringify(saved.layout)!==JSON.stringify(calibrationLayout()))return false;
      projection=MR_HAND_CORE.calibrate(saved.corners);corners=saved.corners;
      flipX.checked=!!saved.flipX;flipY.checked=!!saved.flipY;
      offsetX.value=String(Math.min(30,Math.max(-30,Number(saved.offsetX)||0)));
      offsetY.value=String(Math.min(30,Math.max(-30,Number(saved.offsetY)||0)));
      markerSide.value=['above','below','left','right'].includes(saved.markerSide)?saved.markerSide:'above';
      markerDistance.value=String(Math.min(30,Math.max(4,Number(saved.markerDistance)||12)));
      calibrating=false;panel.classList.remove('calibrating');cancelInput();renderPreview(null);
      message('Saved camera calibration restored. Open your hand to use the cursor. Recalibrate if the camera or table moved.');return true;
    }catch(error){projection=null;corners=[];return false;}
  }
  let tvWindow=null;
  movePanel.onclick=async()=>{
    try {
      // Reuse the controller window already placed on the TV by the launcher.
      const target=window.open('', 'ACE_Controller');
      if(!target||target.location.origin!==location.origin||!target.document.getElementById('main-panel')){
        message('Launch the Controller on the TV first, then move the camera controls.');return;
      }
      if(tvWindow===target){target.focus();return;}
      const stylesheet=target.document.createElement('link');stylesheet.rel='stylesheet';
      stylesheet.href=new URL('session/css/hand-tracking.css',location.href).href;
      const layout=target.document.createElement('style');
      layout.textContent='#mr-hand-panel, #mr-hand-panel.calibrating {width:700px;max-width:calc(100vw - 24px)}';
      target.document.head.append(stylesheet,layout);
      target.document.body.append(panel);tvWindow=target;
      movePanel.textContent='Camera controls are on the TV';movePanel.disabled=true;
      if(stream)await video.play();
      target.addEventListener('pagehide',()=>{
        stop();document.body.append(panel);tvWindow=null;movePanel.disabled=false;
        movePanel.textContent='Move camera controls to TV';message('TV controller closed or reloaded. Camera stopped.');
      },{once:true});
      target.focus();
    }catch(error){message('Could not move camera controls: '+error.message);}
  };
  function mark(tag,attrs,text) {
    const el=document.createElementNS(svg.namespaceURI,tag);
    for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);
    if(text)el.textContent=text;svg.append(el);return el;
  }
  function actionPoint(point){
    const table=MR_ADAPTER.table();
    const distance=Math.min(30,Math.max(4,Number(markerDistance.value)||12));
    const horizontal=['left','right'].includes(markerSide.value),axis=horizontal?'x':'y';
    const step=distance/(horizontal?table.widthCm:table.heightCm);
    const direction=['right','below'].includes(markerSide.value)?1:-1;
    const aim=mode.value==='select'&&point.closing?point.pressOrigin:point;
    const target={x:aim.x,y:aim.y};
    // Hold the cursor at the edge instead of jumping to the opposite side of the hand.
    target[axis]=Math.max(.02,Math.min(.98,aim[axis]+step*direction));
    return target;
  }
  function drawHandShadow(point,target,transform){
    // Translate the detected pose beside the hand so the projector can show it.
    const joints=point.joints.map(j=>transform.project(j.x+target.x-point.x,j.y+target.y-point.y));
    const palmSize=Math.hypot(joints[0].x-joints[9].x,joints[0].y-joints[9].y);
    const width=Math.max(8,Math.min(24,palmSize*.15)),color=point.pinched?'#38bdf8':'#a5f3fc';
    mark('polygon',{'data-hand-shadow':'palm',points:[0,1,2,5,9,13,17].map(i=>`${joints[i].x},${joints[i].y}`).join(' '),fill:'#083344','fill-opacity':.65,stroke:color,'stroke-width':2});
    for(const finger of [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]]){
      const path=finger.map(i=>`${joints[i].x},${joints[i].y}`).join(' ');
      mark('polyline',{'data-hand-shadow':'finger',points:path,fill:'none',stroke:'#082f49','stroke-opacity':.8,'stroke-width':width+4,'stroke-linecap':'round','stroke-linejoin':'round'});
      mark('polyline',{points:path,fill:'none',stroke:color,'stroke-opacity':.75,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'});
    }
  }
  function drawOverlay(point) {
    svg.replaceChildren();
    if(calibrating){
      const points=MR_TABLE.geometry().points;
      // Cover the map with a high-contrast checker grid inside the table footprint.
      const at=(u,v)=>({
        x:(1-v)*((1-u)*points[0].x+u*points[1].x)+v*((1-u)*points[3].x+u*points[2].x),
        y:(1-v)*((1-u)*points[0].y+u*points[1].y)+v*((1-u)*points[3].y+u*points[2].y)
      });
      for(let row=0;row<6;row++)for(let col=0;col<8;col++){
        const cell=[[col/8,row/6],[(col+1)/8,row/6],[(col+1)/8,(row+1)/6],[col/8,(row+1)/6]];
        mark('polygon',{'data-calibration-grid':'cell',points:cell.map(([u,v])=>{const p=at(u,v);return `${p.x},${p.y}`;}).join(' '),fill:(row+col)%2?'#07121c':'#fff',stroke:'#00e5ff','stroke-width':2});
      }
      mark('polygon',{points:points.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:'#ffff00','stroke-width':6});
      points.forEach((p,i)=>{
        mark('circle',{cx:p.x,cy:p.y,r:26,fill:'#07121c',stroke:'#ffff00','stroke-width':5});
        mark('text',{x:p.x,y:p.y+9,fill:'#ffff00','text-anchor':'middle','font-size':28,'font-weight':'bold'},String(i+1));
      });
    }
    if(stroke)mark('polyline',{points:stroke.map(c=>{const p=map.project(c),r=map.getContainer().getBoundingClientRect();return `${p.x+r.left},${p.y+r.top}`;}).join(' '),fill:'none',stroke:'#38bdf8','stroke-width':4,'stroke-linecap':'round'});
    if(point) {
      const transform=MR_TABLE.affine(MR_TABLE.geometry().points,1,1),adjacent=actionPoint(point);
      drawHandShadow(point,adjacent,transform);
      const tip=transform.project(point.x,point.y),p=transform.project(adjacent.x,adjacent.y);
      mark('line',{x1:tip.x,y1:tip.y,x2:p.x,y2:p.y,stroke:'#fff','stroke-width':2,'stroke-dasharray':'5 5'});
      mark('circle',{cx:tip.x,cy:tip.y,r:3,fill:'#fff'});
      if(point.progress>0&&!point.pinched)mark('circle',{cx:p.x,cy:p.y,r:19,fill:'none',stroke:'#38bdf8','stroke-width':4,'stroke-dasharray':`${point.progress*119.38} 119.38`,transform:`rotate(-90 ${p.x} ${p.y})`});
      mark('circle',{'data-hand-cursor':'target',cx:p.x,cy:p.y,r:13,fill:point.pinched?'#38bdf8':'#082f49','fill-opacity':point.pinched?1:.7,stroke:'#fff','stroke-width':3});
    }
  }
  function cancelInput(){stroke=null;lastPoint=null;tracker.reset();drawOverlay(null);}
  async function enableAction() {
    const layer=mode.value==='draw'?'canvas-btn':mode.value==='select'?'epc-btn':null;
    if(layer){await MR_ADAPTER.setLayer(layer,true);MR_SESSION.publish();}
  }
  function process(landmarks,time) {
    if(!projection||calibrating){
      tracker.reset();stroke=null;lastPoint=null;drawOverlay(null);
      if(!calibrating)message('Calibrate table corners before using the map cursor, drawing, or EPC selection.');
      return;
    }
    const point=tracker.update(landmarks,calibrating||!projection?null:tip=>{
      const p=projection(tip),table=MR_ADAPTER.table();
      return {x:(flipX.checked?1-p.x:p.x)+(Number(offsetX.value)||0)/table.widthCm,
        y:(flipY.checked?1-p.y:p.y)+(Number(offsetY.value)||0)/table.heightCm};
    },time);
    if(!point){message(landmarks?'Hand detected, but the aim is outside the calibrated table. Check the four corners and pointer alignment.':'No hand detected. Bring your hand into the camera view.');stroke=null;lastPoint=null;drawOverlay(null);return;}
    if(!lastPoint)message('Move your whole hand to steer the ring. '+(mode.value==='pointer'?'Check pointer alignment.':'Open your hand, then pinch to '+(mode.value==='draw'?'draw.':'select.')));
    lastPoint=point;
    const coordinate=MR_ADAPTER.coordinate({...actionPoint(point),transform:MR_ADAPTER.table().revision});
    if(point.down&&mode.value==='select') {
      if(map.getLayer('epc-buildings-fill')&&MR_ADAPTER.active['epc-btn']){
        const p=map.project(coordinate);
        const hits=map.queryRenderedFeatures([[p.x-5,p.y-5],[p.x+5,p.y+5]],{layers:['epc-buildings-fill']});
        if(hits.length){window.mrSelectEpc(coordinate);message('Building selected. Open your hand before the next pinch.');}
        else message('No EPC building at this point. Pinch over a footprint.');
      }else message('EPC building layer is still loading. Try again shortly.');
    }
    if(mode.value==='draw'&&MR_ADAPTER.active['canvas-btn']) {
      if(point.down)stroke=[coordinate];
      if(point.pinched&&stroke&&stroke.length<2000) {
        const a=map.project(stroke.at(-1)),b=map.project(coordinate);
        if(Math.hypot(a.x-b.x,a.y-b.y)>=3)stroke.push(coordinate);
      }
      if(point.up&&stroke) {
        MR_SESSION.canvas({operation:'create',objectId:MR.id(),object:{tool:'pen',points:stroke,color:'#38bdf8',width:4,text:''}});
        stroke=null;message('Drawing saved to Canvas. Use Canvas Undo to remove it.');
      }
    }else stroke=null;
    drawOverlay(point);
  }
  function renderPreview(landmarks) {
    ctx.clearRect(0,0,preview.width,preview.height);
    ctx.fillStyle='#38bdf8';
    for(const p of landmarks||[]) {ctx.beginPath();ctx.arc(p.x*preview.width,p.y*preview.height,4,0,Math.PI*2);ctx.fill();}
    ctx.font='bold 20px system-ui';
    corners.forEach((p,i)=>{ctx.fillStyle='#fff';ctx.fillText(String(i+1),p.x*preview.width,p.y*preview.height);});
  }
  function loop(time) {
    if(!running)return;
    try {
      if(video.readyState>=2&&video.currentTime!==lastFrame&&time-lastTime>=50) {
        lastFrame=video.currentTime;lastTime=time;
        const landmarks=detector.detectForVideo(video,time).landmarks[0];
        renderPreview(landmarks);process(landmarks,time);
      }
    }catch(error){stop();message('Tracking stopped: '+error.message);return;}
    frame=requestAnimationFrame(loop);
  }
  function stop() {
    generation++;running=false;starting=false;cancelAnimationFrame(frame);
    stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;
    detector?.close();detector=null;projection=null;calibrating=false;panel.classList.remove('calibrating');corners=[];cancelInput();renderPreview(null);
    start.disabled=false;stopButton.disabled=true;camera.disabled=false;calibrateButton.disabled=true;
  }
  start.onclick=async()=>{
    if(starting||running)return;
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){message('Camera access requires localhost or HTTPS.');return;}
    const token=++generation;starting=true;start.disabled=true;stopButton.disabled=false;camera.disabled=true;
    message('Requesting camera and loading hand tracker…');
    try {
      const localStream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},...(camera.value?{deviceId:{exact:camera.value}}:{})},audio:false});
      if(token!==generation){localStream.getTracks().forEach(t=>t.stop());return;}
      stream=localStream;video.srcObject=stream;await video.play();
      if(token!==generation)return;
      preview.width=video.videoWidth;preview.height=video.videoHeight;
      const devices=await navigator.mediaDevices.enumerateDevices();
      if(token!==generation)return;
      const selected=stream.getVideoTracks()[0].getSettings().deviceId;camera.replaceChildren(new Option('Default camera',''));
      devices.filter(d=>d.kind==='videoinput').forEach((d,i)=>camera.add(new Option(d.label||'Camera '+(i+1),d.deviceId)));
      camera.value=selected||'';
      const {FilesetResolver,HandLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
      const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      if(token!==generation)return;
      const localDetector=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.6,minTrackingConfidence:.6});
      if(token!==generation){localDetector.close();return;}
      detector=localDetector;await enableAction();
      if(token!==generation)return;
      running=true;starting=false;lastFrame=-1;lastTime=0;calibrateButton.disabled=false;
      stream.getVideoTracks()[0].addEventListener('ended',()=>{stop();message('Camera disconnected. Start again to reconnect.');});
      if(!restoreCalibration())beginCalibration();frame=requestAnimationFrame(loop);
    }catch(error){if(token===generation){stop();message(error.name==='NotAllowedError'?'Camera permission denied. Allow camera access, then retry.':'Could not start tracking: '+error.message);}}
  };
  stopButton.onclick=()=>{stop();message('Camera stopped.');};
  function beginCalibration(){
    projection=null;corners=[];calibrating=true;cancelInput();
    flipX.checked=flipY.checked=false;offsetX.value=offsetY.value='0';
    panel.classList.add('calibrating');
    message('In the camera preview, click the physical table corner matching projected number 1.');
    drawOverlay(null);
  }
  calibrateButton.onclick=beginCalibration;
  preview.onclick=e=>{
    if(!calibrating)return;
    const r=preview.getBoundingClientRect();corners.push({x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});
    if(corners.length<4){message('Click the camera-preview corner matching projected number '+(corners.length+1)+'.');return;}
    try {projection=MR_HAND_CORE.calibrate(corners);calibrating=false;panel.classList.remove('calibrating');cancelInput();message('Calibrated. Open your hand, then point and pinch over the table.');saveCalibration();}
    catch(error){corners=[];message(error.message+' Start again with corner 1.');}
  };
  mode.onchange=async()=>{cancelInput();try{if(running)await enableAction();if(running&&!projection&&!calibrating)message('Calibrate table corners before using this action.');}catch(error){mode.value='pointer';message(error.message);}};
  for(const input of [flipX,flipY,offsetX,offsetY])input.onchange=()=>{
    if(input.type==='number')input.value=String(Math.min(30,Math.max(-30,Number(input.value)||0)));
    cancelInput();if(!calibrating)message(projection?'Alignment adjusted. Open your hand to check the pointer.':'Calibrate table corners before adjusting the pointer.');
    saveCalibration();
  };
  for(const input of [markerSide,markerDistance])input.onchange=()=>{
    cancelInput();if(!calibrating)message(projection?'Cursor offset adjusted. Open your hand; select and draw at the large ring.':'Calibrate table corners before using the cursor.');
    saveCalibration();
  };
  window.addEventListener('mr-transform',()=>{if(projection){try{window.localStorage.removeItem(calibrationKey());}catch(error){}}projection=null;calibrating=false;panel.classList.remove('calibrating');corners=[];cancelInput();if(running)message('Table alignment changed. Calibrate again.');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(running||starting)){stop();message('Camera stopped while this page was hidden.');}});
  window.addEventListener('pagehide',stop);
})();
