/* global CFD */
importScripts('cfd-core.js');
let solver = null, generation = 0, timer = null, lastSnapshot = 0;
let profiling=false, stepMs=0, stepCount=0;
function run() {
  if (!solver) return;
  try {
    const deadline = performance.now() + 12;
    let batch = 0;
    do { const start=profiling?performance.now():0; solver.step(); if(profiling){stepMs+=performance.now()-start;stepCount++;} batch++; } while (batch < 32 && performance.now() < deadline);
    if (performance.now() - lastSnapshot >= 80) {
      const start=profiling?performance.now():0;
      const field = solver.snapshot();
      if(profiling){field.solverProfile={stepMs,stepCount,snapshotMs:performance.now()-start,nx:solver.nx,ny:solver.ny};stepMs=stepCount=0;}
      postMessage({ type: 'field', generation, ...field }, [field.ux.buffer, field.uy.buffer]);
      lastSnapshot = performance.now();
    }
    timer = setTimeout(run, 0);
  } catch (error) {
    solver = null;
    postMessage({ type: 'error', generation, message: error.message });
  }
}
onmessage = ({ data }) => {
  if(data.type==='profile-pause' && profiling && data.generation===generation){
    clearTimeout(timer);timer=null;
    postMessage({type:'profile-paused',generation,paused:!!data.paused});
    if(!data.paused && solver)run();
    return;
  }
  clearTimeout(timer);
  generation = data.generation;
  profiling=!!data.profile;stepMs=stepCount=0;
  solver = null;
  if (data.type !== 'init') return;
  try {
    solver = new CFD.Solver(data.options);
    const field = solver.snapshot();
    postMessage({ type: 'field', generation, ...field }, [field.ux.buffer, field.uy.buffer]);
    lastSnapshot = performance.now();
    run();
  } catch (error) { postMessage({ type: 'error', generation, message: error.message }); }
};
