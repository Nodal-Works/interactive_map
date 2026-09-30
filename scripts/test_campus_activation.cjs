const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const MR=require('../session/js/shared.js');
const sent=[];
class Channel {
  addEventListener(){}
  postMessage(message){sent.push(message);}
}
const context={MR,BroadcastChannel:Channel,setTimeout(){},map:{on(){}},
  document:{getElementById(){throw Error('Campus Vision must not require a map toolbar button');}},
  window:{addEventListener(){},dispatchEvent(){}}};
vm.runInNewContext(fs.readFileSync(require.resolve('../session/js/adapter.js'),'utf8'),context);
const adapter=context.window.MR_ADAPTER;
adapter.setLayer('campus-demo-btn',false);
assert.equal(sent.length,0,'Already disabled is a no-op');
adapter.setLayer('campus-demo-btn',true);
adapter.setLayer('campus-demo-btn',true);
assert.equal(sent.length,1,'Duplicate enable cannot toggle the presentation off');
assert.equal(adapter.active['campus-demo-btn'],true);
assert.deepEqual(JSON.parse(JSON.stringify(sent[0])),{type:'control_action',target:'campus-demo-btn',action:'click',sessionAction:true});
adapter.setLayer('campus-demo-btn',false);
adapter.setLayer('campus-demo-btn',false);
assert.equal(sent.length,2,'Duplicate disable cannot restart the presentation');
assert.equal(adapter.active['campus-demo-btn'],false);
console.log('PASS: Campus Vision activation without a map button and duplicate desired-state commands');
