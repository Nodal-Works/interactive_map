const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function load(storage = {}, file, fails = false) {
  const context = {window:{dispatchEvent(){}}, Event:class{},console:{warn(){}}, localStorage:{getItem:k=>storage[k]||null},
    XMLHttpRequest:class {open(){} send(){if(fails)throw Error('offline');this.status=file?200:404;this.responseText=JSON.stringify(file);}}};
  vm.createContext(context);
  for(const path of ['app-config.js','calibration-config.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context);
  return context.window;
}
const base=load(),custom={id:'saved-1',center:{lng:12,lat:58},zoom:15,bearing:10,dimensions:{tableWidth:120}};
assert.equal(base.MR_CALIBRATION.current.zoom,16.22141031611213);
assert.equal(load({},custom).MR_CALIBRATION.original.zoom,15);
assert.equal(load({},null,true).MR_CALIBRATION.current.zoom,base.MR_CALIBRATION.current.zoom);
const state={interactive_map_selected_calibration:custom.id,interactive_map_calibrations:JSON.stringify([custom])};
const selected=load(state).MR_CALIBRATION;
assert.equal(selected.current.zoom,15);assert.equal(selected.dimensions.tableWidth,120);assert.equal(selected.dimensions.tableHeight,60);
assert.equal(load({...state,interactive_map_selected_calibration:'original'}).MR_CALIBRATION.current.zoom,base.MR_CALIBRATION.current.zoom);
assert.equal(load({interactive_map_default_calibration:JSON.stringify(custom)}).MR_CALIBRATION.current.zoom,15);
selected.applyDimensions({tableWidth:-1});assert.equal(selected.dimensions.tableWidth,100);
for(const asset of Object.values(base.APP_CONFIG.assets)) assert.ok(fs.existsSync(asset),asset);
console.log('PASS shared configuration, calibration fallback/presets/dimensions, asset paths');
