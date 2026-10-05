const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../animations/cfd-core.js');
const names=['dragPan','dragRotate','doubleClickZoom','scrollZoom','boxZoom','keyboard','touchZoomRotate','touchPitch'];
const enabled={};const map=Object.fromEntries(names.map(name=>[name,{enable(){enabled[name]=true;},disable(){enabled[name]=false;}}]));
const source=fs.readFileSync('main.js','utf8');
const gate=source.slice(source.indexOf('function applyInteractionGate()'),source.indexOf('window.mrApplyInteractionGate'));
const ctx={map,calibrationModeActive:false,centerLocked:false};vm.createContext(ctx);vm.runInContext(gate,ctx);
for(const [calibrationModeActive,centerLocked,expected]of [[false,false,false],[true,false,true],[true,true,false],[false,false,false]]){
 Object.assign(ctx,{calibrationModeActive,centerLocked});ctx.applyInteractionGate();assert.ok(names.every(name=>enabled[name]===expected));}
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
for(const angle of [0,45,90,180,270]){
 const grid=C.domain(100,80,100,angle,20),solver=new C.Solver(grid);
 assert.ok(grid.x0>=grid.contextCells+16&&grid.y0>=grid.contextCells+16);
 for(let y=-20;y<100;y++)for(let x=-20;x<120;x++)assert.equal(solver.sponge[(y+grid.y0)*grid.nx+x+grid.x0],0,'Surrounding buildings are outside the absorbing boundary');
 const mask=C.rasterizeBuildings([{geometry:{type:'Polygon',coordinates:[rect(-15,20,10,12),rect(-12,23,4,4)]}}],c=>({x:c[0],y:c[1]}),grid);
 assert.equal(mask[(22+grid.y0)*grid.nx-14+grid.x0],1,'Outside building influences upstream flow');
 assert.equal(mask[(24+grid.y0)*grid.nx-11+grid.x0],0,'Courtyard stays open');
 assert.ok(Math.abs(solver.sponge[0]-.2)<1e-6,'Far field retains damping');
 assert.ok(!mask.slice(0,grid.nx).some(Boolean),'No wall enclosing the domain');
}
console.log('PASS Universeum: every navigation handler obeys Calibration, context buildings and courtyards rasterize, damping begins beyond the context');
