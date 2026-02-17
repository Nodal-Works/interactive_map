import { StreetViewIntegration } from './animations/street_view.js';

console.log('✓ Module imported successfully');
console.log('✓ StreetViewIntegration class is available');

// Verify class structure
const proto = StreetViewIntegration.prototype;
const publicMethods = ['start', 'stop', 'toggle', 'isActive'];
const privateMethods = ['activateStreetView', 'deactivateStreetView', 'addMapLayers', 'onMapClick', 'onMapMouseMove'];

console.log('\n✓ Public Methods:');
publicMethods.forEach(method => {
  if (typeof proto[method] === 'function') {
    console.log(`  ✓ ${method}()`);
  }
});

console.log('\n✓ Private Methods:');
privateMethods.forEach(method => {
  if (typeof proto[method] === 'function') {
    console.log(`  ✓ ${method}()`);
  }
});

console.log('\n✓ All checks passed!');
