const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
  let disconnects=0,starts=0,posts=0,removed=0;
  const node=()=>({connect(){},disconnect(){disconnects++;}});
  const audio={state:'running',createBufferSource:()=>({...node(),start(){starts++;},stop(){throw Error('already ended');}}),createGain:()=>({...node(),gain:{}}),createAnalyser:()=>({...node(),frequencyBinCount:8}),decodeAudioData:async()=>({})};
  const ctx=vm.createContext({console,Uint8Array,clearTimeout(){},document:{getElementById:()=>({remove(){removed++;}})},window:{addEventListener(){},MR_AUDIO_CONTEXT:audio},fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})});
  vm.runInContext(fs.readFileSync('animations/bird-sounds.js','utf8'),ctx);
  const Bird=vm.runInContext('BirdSoundsLayer',ctx),bird=Object.create(Bird.prototype);
  Object.assign(bird,{isActive:true,loadingSound:false,activeSounds:[],buffers:new Map(),generation:0,audioContext:audio,sensors:[{id:1}],birds:[{name:'Test',file:'bird.mp3'}],controllerChannel:{postMessage(){posts++;}},invalidate(){},masterVolume:.5});
  await bird.playRandomBird();assert.equal(starts,1);assert.equal(bird.activeSounds.length,1);
  bird.activeSounds[0].source.onended();assert.equal(bird.activeSounds.length,0);assert.equal(disconnects,3,'Ended sources must not prevent gain/analyser cleanup');
  let finish;ctx.fetch=()=>new Promise(resolve=>finish=resolve);bird.buffers.clear();const pending=bird.playRandomBird();
  bird.stopAll();finish({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await pending;
  assert.equal(starts,1,'A stopped layer must not play an outstanding download');assert.equal(bird.activeSounds.length,0);assert.equal(removed,1);
  audio.state='suspended';let prompted=false;bird.initAudioContext=()=>{};bird.showInteractionPrompt=()=>prompted=true;
  await bird.playRandomBird();assert.equal(prompted,true);assert.equal(starts,1);
  console.log('PASS audio completion cleanup, delayed loading cancellation and blocked-playback prompt');
})().catch(e=>{console.error(e);process.exitCode=1;});
