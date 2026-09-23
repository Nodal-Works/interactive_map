/* global CFD */
importScripts('cfd-core.js');
let solver = null, generation = 0, timer = null, lastSnapshot = 0;
function run() {
  if (!solver) return;
  try {
    const deadline = performance.now() + 12;
    let batch = 0;
    do { solver.step(); batch++; } while (batch < 32 && performance.now() < deadline);
    if (performance.now() - lastSnapshot >= 80) {
      const field = solver.snapshot();
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
  clearTimeout(timer);
  generation = data.generation;
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
