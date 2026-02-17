# IsovistAnimation - Usage Guide

## Quick Start

### Basic Setup
```javascript
import { IsovistAnimation } from './animations/isovist.js';

// Create instance with your Mapbox GL map
const isovist = new IsovistAnimation(map);

// Initialize (loads obstacles if available)
isovist.initIsovist();

// Start visualization
isovist.start();
```

### Control Methods
```javascript
// Start visualization
isovist.start();

// Stop visualization
isovist.stop();

// Toggle on/off
isovist.toggle();

// Get current state
const isActive = isovist.isovistActive;
```

---

## Configuration

### Building Data Source
Configure where the system loads building obstacle data:

```javascript
// Option 1: Set global URL before creating instance
window.ISOVIST_BUILDING_DATA_URL = 'https://api.example.com/buildings.geojson';

const isovist = new IsovistAnimation(map);
await isovist.loadBuildingObstacles();
```

```javascript
// Option 2: GeoJSON from /data/buildings.geojson (default location)
// Place your buildings.geojson file in the /data directory
```

### View Parameters
Modify visualization parameters:

```javascript
const isovist = new IsovistAnimation(map);

// Maximum view distance (meters)
isovist.MAX_VIEW_DISTANCE = 300;

// Number of rays to cast (360 = 1° per ray)
isovist.RAY_COUNT = 360;

// Human field of view (degrees)
isovist.HUMAN_FOV = 120;

// Enable/disable FOV limitation
isovist.USE_HUMAN_FOV = true;

// Cursor following behavior
isovist.FOLLOW_CURSOR = true;
isovist.FOLLOW_THRESHOLD = 50; // meters
isovist.FOLLOW_SPEED = 0.15;   // 0-1, higher = faster

// Tree obstacles
isovist.INCLUDE_TREES = true;
isovist.TREE_BASE_RADIUS = 2;           // meters
isovist.TREE_RADIUS_VARIATION = 1.5;    // meters
isovist.TREE_HEIGHT_FACTOR = 0.3;       // additional radius per meter height
```

### Audio Settings
Configure ambient soundscape:

```javascript
// Enable/disable ambient audio
isovist.ambientSoundEnabled = true;

// Volume caps
isovist.MAX_AMBIENT_VOLUME = 0.5; // 50%

// Volume transition smoothness
isovist.VOLUME_SMOOTHING = 0.1;   // 0-1, lower = smoother
```

---

## Advanced Usage

### Programmatic Control
```javascript
// Manually set viewer position
isovist.viewerPosition = [longitude, latitude];

// Set look direction (bearing in degrees)
const bearing = isovist.calculateBearing(
  isovist.viewerPosition,
  [lng2, lat2]
);

// Calculate features at specific location
const stats = isovist.calculateIsovistFeatures(
  isovist.viewerPosition,
  bearing
);

console.log('Visible area (m²):', stats.visibleArea);
console.log('Tree rays:', stats.treeRays);
console.log('Total rays:', stats.totalRays);
console.log('Green View Factor:', stats.treeRays / stats.totalRays);
```

### Event Monitoring
The system broadcasts statistics via BroadcastChannel:

```javascript
// Listen for isovist statistics
const channel = new BroadcastChannel('map_controller_channel');

channel.addEventListener('message', (event) => {
  if (event.data.type === 'isovist_stats') {
    const { visibleArea, treeRays, totalRays } = event.data.data;
    console.log('Green View Factor:', treeRays / totalRays);
  }
});
```

### Multiple Instances
Create multiple independent isovists on different maps:

```javascript
const isovist1 = new IsovistAnimation(map1);
const isovist2 = new IsovistAnimation(map2);

// Each instance manages independently
isovist1.start();
isovist2.stop();

// Document-level listeners (audio unlock) are shared
```

### Custom Data Loading
```javascript
// Load custom GeoJSON features
const customGeojson = {
  type: 'FeatureCollection',
  features: [
    {
      geometry: {
        type: 'Polygon',
        coordinates: [[/* ring of coordinates */]]
      }
    }
  ]
};

isovist.processGeoJSON(customGeojson);
```

---

## API Reference

### Constructor
```javascript
new IsovistAnimation(map)
```
- **map** (Mapbox GL Map) - Map instance for visualization

### Public Methods

#### Control
- `start()` - Activate visualization
- `stop()` - Deactivate visualization
- `toggle()` - Toggle active state

#### Lifecycle
- `initIsovist()` - Load obstacles and initialize
- `activateIsovist()` - Start visualization and event listeners
- `deactivateIsovist()` - Stop visualization and cleanup

#### Calculations
- `calculateBearing(from, to)` - Get compass bearing between points
- `distance(point1, point2)` - Get distance in meters (Haversine)
- `destination(origin, distanceMeters, bearingDegrees)` - Project point
- `calculateIsovistFeatures(origin, lookDirection)` - Main visibility calc
- `lineIntersection(p1, p2, p3, p4)` - Line segment intersection

#### Obstacle Management
- `loadBuildingObstacles()` - Load from configured source
- `processGeoJSON(geojson)` - Process GeoJSON features
- `addObstacle(ring, properties)` - Add polygon obstacle

#### Position Validation
- `getValidPosition(position)` - Validate and correct position
- `isPointInsideAnyBuilding(point)` - Check collision
- `findNearestValidPosition(position)` - Find safe location

---

## Event Flow

### Activation Sequence
1. `start()` is called
2. `activateIsovist()` initializes map layers
3. Event listeners registered
4. Animation loop begins
5. `performUpdate()` runs each frame
6. `calculateIsovistFeatures()` computes visibility
7. Statistics broadcast via BroadcastChannel
8. Audio levels updated based on Green View Factor

### Deactivation Sequence
1. `stop()` is called
2. `deactivateIsovist()` triggered
3. Event listeners removed
4. Animation loop stopped
5. Map layers removed
6. Audio stopped
7. State cleared

---

## Performance Tips

1. **Reduce Ray Count** for better performance on slower devices:
   ```javascript
   isovist.RAY_COUNT = 180; // instead of 360
   ```

2. **Limit View Distance** to reduce computation:
   ```javascript
   isovist.MAX_VIEW_DISTANCE = 100; // instead of 200
   ```

3. **Use Bbox Optimization** - Already built in, but ensure obstacles have minimal overlap

4. **Cache GeoJSON** - Load building data once, reuse for multiple isovists

5. **Disable Audio** if not needed:
   ```javascript
   isovist.ambientSoundEnabled = false;
   ```

---

## Troubleshooting

### Issue: No obstacles loading
**Solution:** Check console for message about `ISOVIST_BUILDING_DATA_URL` and provide valid GeoJSON source

```javascript
window.ISOVIST_BUILDING_DATA_URL = '/data/buildings.geojson';
isovist.initIsovist();
```

### Issue: Audio not playing
**Solution:** Audio requires user interaction first (browser autoplay policy)
- Click anywhere on page to unlock audio
- Check browser console for autoplay policy errors

```javascript
document.addEventListener('click', () => {
  // Audio should unlock automatically
});
```

### Issue: Poor performance
**Solution:** Reduce computational load:
```javascript
isovist.RAY_COUNT = 180;        // fewer rays
isovist.MAX_VIEW_DISTANCE = 100; // shorter range
isovist.INCLUDE_TREES = false;   // disable trees
```

### Issue: Position stuck in building
**Solution:** The system tries to find nearest valid position automatically:
```javascript
// Manual correction if needed
const validPos = isovist.getValidPosition(invalidPosition);
isovist.viewerPosition = validPos;
```

---

## Integration Example

### With Leaflet Map
```javascript
import { IsovistAnimation } from './animations/isovist.js';

// Create map
const map = L.map('map').setView([51.5, -0.09], 13);

// Note: IsovistAnimation expects Mapbox GL API
// For Leaflet integration, you'd need to adapt the code
// to use Leaflet's layer and event system
```

### With React
```javascript
import { useEffect, useRef } from 'react';
import { IsovistAnimation } from './animations/isovist.js';

export function IsovistComponent({ map }) {
  const isovistRef = useRef(null);

  useEffect(() => {
    if (!map) return;
    
    isovistRef.current = new IsovistAnimation(map);
    isovistRef.current.initIsovist();

    return () => {
      isovistRef.current?.deactivateIsovist();
    };
  }, [map]);

  return (
    <div>
      <button onClick={() => isovistRef.current?.toggle()}>
        Toggle Isovist
      </button>
    </div>
  );
}
```

---

## Data Format

### Building GeoJSON Format
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [lon1, lat1],
          [lon2, lat2],
          [lon3, lat3],
          [lon1, lat1]
        ]]
      },
      "properties": {
        "name": "Building Name",
        "height": 20
      }
    }
  ]
}
```

---

## Browser Support

- **Chrome/Edge**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Requires**: 
  - ES6 class support
  - requestAnimationFrame
  - BroadcastChannel API (optional, for cross-window communication)
  - Web Audio API (optional, for ambient soundscape)

---

## Performance Metrics

Typical performance on modern hardware:
- **360 rays**: 60 FPS at 200m view distance
- **180 rays**: 60 FPS with trees enabled
- **90 rays**: Smooth performance on mobile devices

Test and adjust `RAY_COUNT` based on your target devices.

---

## Further Reading

- See `REFACTORING_SUMMARY.md` for overview of ES6 refactoring
- See `REFACTORING_DETAILS.md` for detailed technical information
- Check original source for calculation algorithms and methodology
