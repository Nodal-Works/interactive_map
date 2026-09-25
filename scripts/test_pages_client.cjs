/* Exercise the actual client bootstrap and invitation compatibility without network access. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const expected = JSON.parse(read('services.example.json')).client_url;
const release = /const RELEASE = '([^']+)'/.exec(read('session/js/shared.js'))[1];
function bootstrap(invitationRelease) {
  const nodes = new Map();
  const node = () => ({dataset: {}, classList: {add(){}, remove(){}, toggle(){}},
    append(){}, replaceChildren(){}, setAttribute(){}, addEventListener(){}, textContent: ''});
  const get = id => {if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id);};
  let started = false, metadata;
  const store = {getItem: () => null, setItem(){}};
  const location = new URL(expected + '?host=sample-peer&token=sample-token&release=' + invitationRelease);
  const context = {URL, URLSearchParams, crypto: webcrypto, location, console,
    document: {currentScript: {src: new URL('session/js/client.js', expected).href},
      getElementById: get, createElement: node, addEventListener(){}, body: node()},
    localStorage: store, sessionStorage: store, addEventListener(){},
    Option: function(){}, Peer: function(){}, MR_CONTROLS: function(){},
    MR_CONNECTION: function(options){metadata=options.metadata; this.start=()=>{started=true;};}};
  context.window=context;
  vm.createContext(context);
  for (const name of ['app-config.js','session/js/config.js','session/js/shared.js','session/js/client.js'])
    vm.runInContext(read(name), context, {filename:name});
  assert.equal(context.MR_CONFIG.clientUrl, expected);
  return {started, metadata, nodes, context};
}
const compatible = bootstrap(release);
assert.equal(compatible.started, true);
assert.equal(compatible.metadata.release, release);
const incompatible = bootstrap('old-or-other-branch');
assert.equal(incompatible.started, false);
assert.match(incompatible.nodes.get('notice').textContent, /different client version/);
// Execute the host's actual QR URL expression using the configured runtime URL.
const host = read('session/js/host.js');
const invitationCode = host.slice(host.indexOf('const url=new URL(runtime.clientUrl'), host.indexOf('invite=url.href'));
assert.ok(invitationCode.length > 0 && invitationCode.length < 1000);
const invite = vm.runInNewContext(invitationCode+'url.href', {
  URL, URLSearchParams, runtime:{clientUrl:expected}, MR_CONFIG:compatible.context.MR_CONFIG,
  location:new URL('http://127.0.0.1:8090/index.html'), id:'sample-peer', token:'sample-token', MR:{RELEASE:release}
});
assert.equal(new URL(invite).origin+new URL(invite).pathname, expected);
assert.equal(new URL(invite).searchParams.get('release'), release);
console.log('PASS: matching branch QR URL, client bootstrap, and incompatible invitation rejection');
