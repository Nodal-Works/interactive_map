const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('animations/sun-study.js','utf8');
function method(name,next){const start=source.indexOf('  '+name+'(');return source.slice(start,source.indexOf('  '+next+'(',start));}
const context=vm.createContext({MR_TABLE:{place:()=>({w:1000,h:600})},THREE:{OrthographicCamera:class{constructor(){this.position={set(){}};this.up={set:(x,y,z)=>this.orientation=[x,y,z]};}lookAt(){this.viewOrientation=this.orientation;}}}});
vm.runInContext('cameraMethods={'+method('setupCamera','setupLights').trim()+'}',context);
const sun={mapBearing:-90,canvas:{}};context.cameraMethods.setupCamera.call(sun);
assert.ok(Math.abs(sun.camera.viewOrientation[0]+1)<1e-8);
assert.ok(Math.abs(sun.camera.viewOrientation[2])<1e-8,'Camera orientation must be updated after the local up vector');
assert.match(source,/this\.baseRotation = 0;/,'Do not rotate the north/east model within the table-local canvas');
vm.runInContext('fitMethods={'+method('fitCameraToModel','onResize').trim()+'}',context);
let fittedScale;
const model={canvas:{},mesh:{scale:{set:x=>{fittedScale=x;}}},modelSize:{x:.6,z:1},scaleMultiplier:1,
  camera:{updateProjectionMatrix(){}},updateSunPosition(){}};
context.fitMethods.fitCameraToModel.call(model);
assert.equal(fittedScale,1000,'Fit model north to table width and east to table height');
(async()=>{
  let complete,initialized=0;
  const c=vm.createContext({loadDependencies:()=>new Promise(resolve=>complete=resolve),setTimeout:()=>1,clearTimeout(){}});
  const init=source.slice(source.indexOf('  async initThreeJS()'),source.indexOf('  // Control panel removed'));
  const show=source.slice(source.indexOf('  async show()'),source.indexOf('  // ==================== MEMORY PROFILING'));
  vm.runInContext('methods={'+init+','+show+'}',c);
  const layer={isActive:true,canvas:{style:{}},setupRenderer(){initialized++;},setupScene(){},setupCamera(){},setupLights(){},setupDualShadowSystem(){},setupPostProcessing(){},loadSTLModel(){}};
  layer.initThreeJS=c.methods.initThreeJS;
  const first=c.methods.show.call(layer),second=c.methods.show.call(layer);layer.isActive=false;complete();await Promise.all([first,second]);
  assert.equal(initialized,1,'Rapid toggles initialize only one renderer');assert.notEqual(layer.canvas.style.display,'block','A completed load cannot show an inactive layer');
  console.log('PASS Sun Study table-local camera and cancellation during shared initialization');
})().catch(error=>{console.error(error);process.exitCode=1;});
