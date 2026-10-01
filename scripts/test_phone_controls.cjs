const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};}
 append(...children){this.children.push(...children);}replaceChildren(){this.children=[];}add(x){this.children.push(x);}setAttribute(k,v){this.attrs[k]=v;}
 querySelectorAll(selector){return this.children.flatMap(function walk(n){return [n,...(n.children||[]).flatMap(walk)];}).filter(n=>selector==='button'?n.tag==='button':n.dataset?.action);}
}
const document={createElement:tag=>new Element(tag),activeElement:null},context={document,window:{},Option:class{constructor(label,value){this.label=label;this.value=value;}}};
vm.runInNewContext(fs.readFileSync('session/js/controls.js','utf8'),context);
const sent=[],root=new Element('div'),controls=new context.window.MR_CONTROLS(root,m=>sent.push(m));
controls.open({id:'cfd-simulation-btn',name:'Wind'});
const trees=controls.inputs.find(x=>x.input.id==='wind-trees').input;
assert.equal(trees.attrs.role,'switch');controls.update({cfd:{trees:false}},true);document.activeElement=trees;
trees.checked=true;trees.onchange();assert.equal(sent.at(-1).message.value,true);assert.equal(trees.checked,false,'Switch waits for host state');
controls.update({cfd:{trees:true}},true);assert.equal(trees.checked,true,'Focused switches receive host confirmation');
controls.update({cfd:{trees:true}},false);assert.equal(trees.disabled,true,'Spectator or disconnected users cannot change settings');
const speed=controls.inputs.find(x=>x.input.id==='wind-speed').input;const before=sent.length;speed.value='7';speed.oninput();assert.equal(sent.length,before);speed.onchange();assert.equal(sent.at(-1).message.value,7);
console.log('PASS: accessible boolean switches, host confirmation while focused, disabled editing, slider release commit');
