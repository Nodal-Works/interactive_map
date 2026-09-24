const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const MR=require('../session/js/shared.js');
assert.equal(MR.LAYERS.length,14);
for(const message of [{type:'calibrate_action',action:'pan_up'},{type:'control_action',target:'calibrate-btn'}, {type:'reset_view'}, {type:'cfd_control',action:'arbitrary'}, {type:'sun_control',action:'set_date',value:'invalid'}, {type:'isovist_control',action:'set_radius',value:Infinity}])assert.equal(MR.validControl(message),false);
assert.equal(MR.validControl({type:'cfd_control',action:'set_wind_speed',value:5}),true);
const alice={id:'alice',name:'Alice'},bob={id:'bob',name:'Bob'},host={id:'host',name:'Host'},objects=[];
const shape={tool:'polygon',points:[[11.97,57.68],[11.98,57.68],[11.98,57.69]],color:'#38bdf8',width:3,creatorId:'forged'};
MR.editObject(objects,alice,{operation:'create',objectId:'shape',object:shape});
assert.equal(objects[0].creatorId,'alice');
assert.throws(()=>MR.editObject(objects,bob,{operation:'delete',objectId:'shape'}),/author/);
assert.throws(()=>MR.editObject(objects,alice,{operation:'update',objectId:'missing',object:shape}),/no longer/);
MR.editObject(objects,host,{operation:'delete',objectId:'shape'});assert.equal(objects.length,0);
for(const bad of [{...shape,points:[[NaN,0]]},{...shape,points:[[1,1],[2,2]]},{...shape,text:'x'.repeat(501)},{...shape,width:100},{...shape,color:'url(evil)'}])assert.equal(MR.validObject(bad),false);
const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../session/js/map.js'),'utf8'),context);
const n=context.window.MR_MAP.normalized;
const table={corners:[[11.978,57.69],[11.978,57.68],[11.968,57.68],[11.968,57.69]]};
for(const[c,expected]of [[table.corners[0],[0,0]],[table.corners[1],[1,0]],[table.corners[2],[1,1]],[table.corners[3],[0,1]]]){const p=n(c,table);assert.ok(Math.abs(p.x-expected[0])<1e-8&&Math.abs(p.y-expected[1])<1e-8);}
console.log('PASS: layer registry, command boundary, annotation ownership/validation, rotated table coordinates');
