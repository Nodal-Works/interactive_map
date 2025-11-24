# Interactive Isovist Feature

## Overview
The interactive isovist creates a real-time visibility polygon (viewshed) that shows what's visible from a draggable viewer point, with building footprints acting as obstructions.

## How to Use

### Option A: Use Default Buildings (Automatic)
1. Open `index.html` (your main interactive map)
2. Click the isovist button (eye/viewshed icon) in the right sidebar
3. Buildings will automatically load from `media/building-footprints.geojson`
4. Click on map to place viewer and start exploring!

### Option B: Load Custom Buildings
1. Download custom building footprints using `fetch-streets.html`
2. Click the upload icon (↓) in the right sidebar of the main map
3. Select your custom `building-footprints.geojson` file
4. Activate isovist mode

### Step 1: Get Building Footprints (Optional)
### Step 1: Get Building Footprints (Optional)
1. Open `fetch-streets.html` in your browser
2. Select "Building Footprints" radio button
3. Click "Fetch Data" to download `building-footprints.geojson`
4. Save to `media/` folder or load via upload button

### Step 2: Load Buildings into Map (Optional - Auto-loads if in media/)
1. If not using default buildings, open `index.html`
2. Click the upload icon (↓) in the right sidebar
3. Select your custom `building-footprints.geojson` file
4. Buildings will appear as blue polygons on the map

### Step 3: Activate Isovist Mode
1. Click the isovist button (eye/viewshed icon) in the right sidebar
2. The button will turn blue and the cursor becomes a crosshair

### Step 4: Interact
1. **Place viewer**: Click anywhere on the map to place the red viewer point
2. **Look around**: Move your cursor - the viewer "looks" toward it
3. **See visibility**: Yellow polygon shows what's visible from the viewer
4. **Move viewer**: Click and drag the red viewer point to reposition it

## Features

- **Real-time updates**: Visibility recalculates on every mouse move
- **Ray-casting**: 360 rays cast from viewer position
- **Building occlusion**: Buildings block the view realistically
- **Direction indicator**: Red line shows viewing direction
- **Draggable viewer**: Click and drag to explore different positions

## Visual Elements

- 🔴 **Red circle**: Viewer position (draggable)
- 🔴 **Red line**: Viewing direction (toward cursor)
- 🟡 **Yellow polygon**: Visible area (isovist)
- 🔵 **Blue polygons**: Building obstacles

## Performance

- Max view distance: 200 meters
- Ray count: 360 (one per degree)
- Updates in real-time as you move cursor

## Tips

- Load denser building data for more accurate occlusion
- The yellow area shows exactly what the viewer can "see"
- Great for urban design and visibility analysis
- Can be used for gaming, architecture, or urban planning demos

## Troubleshooting

**"No buildings loaded" message?**
- Buildings will auto-load from `media/building-footprints.geojson` if available
- If the file is missing, use `fetch-streets.html` to download buildings
- Alternatively, manually load a GeoJSON file with Polygon features
- Make sure buildings are loaded before clicking the isovist button

**Performance slow?**
- Reduce MAX_VIEW_DISTANCE in `animations/isovist.js`
- Reduce RAY_COUNT (e.g., from 360 to 180)
- Load fewer buildings (smaller area)
