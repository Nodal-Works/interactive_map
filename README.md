# ACE MR Studio - Interactive Map

An interactive mixed-reality urban visualization platform built for the ACE MR Studio at Chalmers University of Technology. This application provides multiple data visualization layers for urban planning, environmental analysis, and stakeholder engagement.

![Main Map View](./media/screenshots/controller-main.png)

## Features

### 🗺️ Main Map View
The default view displays a dark basemap with the study area in Gothenburg, Sweden. Multiple basemaps are available including OpenStreetMap, Carto Positron/Dark, Esri Satellite, and OpenTopoMap.

### 🚀 Launcher
A lightweight entry point that centralizes app startup, lets you choose the main display or the controller, performs initial asset loading checks, and helps recover from local file/CORS issues. Open the launcher using [launcher.html](launcher.html).
![alt text](media/Launcher.png)

### 🌆 Street Life View
Street-level activity visualization combining animated agents, street lighting, and environmental overlays. 
![alt text](media/street_life.png)

- 🚍 Public Transport (Västtrafik)
Real-time public-transport layer using the Västtrafik API. Displays vehicle positions, line/stop information and upcoming departures; configurable update intervals and visual styles for vehicles and routes.

### 🌬️ CFD Wind Simulation
Real-time Lattice Boltzmann CFD simulation showing wind flow patterns around buildings. The simulation computes fluid dynamics on the fly and visualizes velocity fields with color-coded flow lines.

![CFD Wind Simulation](./media/screenshots/cfd-simulation.png)

New features:
- Trees can be loaded as STL models and incorporated into the CFD domain as porous/damping obstacles to simulate wind attenuation by vegetation.

### 💧 Stormwater Flow Analysis
Particle-based visualization of stormwater drainage using the D8 flow direction algorithm. Computes flow accumulation from a Digital Elevation Model (DEM) GeoTIFF and shows how water would flow across the terrain.

![Stormwater Flow](./media/screenshots/stormwater.png)

### ☀️ Sun Study
3D shadow analysis using Three.js. Loads an STL model of the buildings and computes solar shadow positions based on date, time, and the location's latitude/longitude (Gothenburg, Sweden).

![Sun Study](./media/screenshots/sun-study.png)

New features:
- Trees can be added as additional STL models and included in the shadow computation; shade contributions from added vegetation can be visualized using a false-color mode for quick interpretation.

### 🖼️ Slideshow
Animated slideshow of various data layers including building footprints, street networks, historic satellite imagery, and analysis results. Supports GeoJSON, images, and videos with metadata overlays.

![Slideshow](./media/screenshots/slideshow.png)

### 📐 Grid Animation
Holographic grid overlay showing physical table tile boundaries. Used for calibrating the projection onto the physical model table.

![Grid Animation](./media/screenshots/grid-animation.png)

### 👁️ Isovist Analysis
Interactive visibility/viewshed analysis. Click on the map to place a viewer and see the visible area based on building obstructions.

New features:
- Trees GeoJSON can be loaded to include vegetation occlusion in the viewshed computation.
- Isovist now highlights visible features (buildings, trees, POIs) to make visibility relationships clearer.
- Dashboard shows realtime Green View Index (GVI) and a path trace of the user location with historical GVI metrics.
- High GVI zones trigger nature audio (bird/ambient natural sounds); low GVI zones play ambient city sounds to convey environmental quality.
- Google Street View can be updated in real time to match the viewer location and orientation.

![Isovist Analysis](./media/screenshots/isovist.png)
![Isovist Analysis](./media/isovist.gif)

### 🐦 Bird Sounds
Spatial audio visualization showing simulated bird sound sensors. Plays audio samples from various bird species with visual feedback on the map.

![Bird Sounds](./media/screenshots/bird-sounds.png)

## Controller Interface

A secondary controller screen provides a touch-friendly interface for operating the visualizations remotely. It communicates with the main display via the BroadcastChannel API.

### Controller Main
![Controller Main](./media/screenshots/controller-main.png)

### Stormwater Dashboard
![Stormwater](./media/screenshots/controller-stormwater.png)

### Sun Study Controls
![Sun Study](./media/screenshots/controller-sun-study.png)

### Credits
![Credits](./media/screenshots/controller-credits.png)

## How to Run

### Launcher (recommended)

- Open the app using the launcher: [launcher.html](launcher.html). You can double-click launcher.html in Finder or open it in your browser.

Notes:
- In most cases the app runs directly from `launcher.html`. If you encounter local file / CORS issues when loading assets (GeoTIFF, STL, or fetch requests), start a simple local server as a fallback:

```bash
# From the repository root (fallback only)
python3 -m http.server 8000
# then open http://localhost:8000/launcher.html
```

TODO:
- Camera-based calibration: currently disabled — see [calibration/README.md](calibration/README.md) for notes. Re-enable when fixed.

### Files Structure

```
├── launcher.html        # Launcher / recommended entry point
├── index.html           # Main display page (alternate entry)
├── controller.html      # Remote controller interface
├── main.js              # Map initialization and core functionality
├── controller.js        # Controller logic
├── style.css            # Styling for both interfaces
├── map-calibration.json # Saved map position/zoom/bearing
├── animations/          # Feature modules
│   ├── bird-sounds.js
│   ├── cfd-simulation.js
│   ├── fcc-demo.js
│   ├── grid-animation.js
│   ├── isovist.js
│   ├── slideshow.js
│   ├── stormwater-flow.js
│   ├── street_view.js
│   ├── street-glow-animation.js
│   ├── street-life.js
│   ├── sun-study.js
│   └── trafik.js
├── media/               # Data files and assets
│   ├── building-footprints.geojson
│   ├── street-network.geojson
│   ├── clipped_dem.geotiff.tif
│   ├── mesh.stl
│   └── slideshow/
└── scripts/             # Utility scripts
    ├── process_dem_flow.py
    └── take_screenshots.py
```

## Technologies

- **MapLibre GL JS** - Map rendering with native rotation/bearing support
- **Three.js** - 3D rendering for sun study shadows
- **GeoTIFF.js** - DEM raster processing in-browser
- **BroadcastChannel API** - Cross-window communication
- **Web Audio API** - Spatial audio for bird sounds

## Credits

- **Principal Investigator**: Alexander Hollberg
- **Development Lead**: Sanjay Somanath  
- **Model Design & Printing**: Arvid Hall
- **Organizations**: Digital Twin Cities Centre, Chalmers University of Technology

## License

This project is part of the ACE MR Studio research initiative at Chalmers University of Technology.

