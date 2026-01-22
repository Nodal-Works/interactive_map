| 14 | Layer Implementation Reference | Appendix G | Detailed visualisation vocabulary per layer |

---

## Appendix G: Layer Implementation Reference — Data Types and Visualisation Vocabulary

This appendix provides a comprehensive reference for each animation layer implemented in the interactive map system, documenting the specific data types, visual encodings, audio treatments, and interaction possibilities. This serves as both a design audit and a practical guide for extending the system.

### Table 14: Complete Layer Classification

| Layer | UDCDM Classification | Primary Data Type | Source |
|-------|---------------------|-------------------|--------|
| **CFD Simulation** | Invisible, Dynamic, Observe, Processed | Wind velocity field (volumetric) | Lattice Boltzmann simulation |
| **Isovist** | Invisible, Parametric, Explore, Processed | Visibility polygon (2D spatial) | Ray-casting from viewer position |
| **Sun Study** | Visible, Parametric, Manipulate, Processed | Shadow projection (2.5D) | Three.js shadow mapping |
| **Stormwater Flow** | Invisible, Dynamic, Observe, Processed | Water accumulation paths | D8 flow from DEM |
| **Street Life** | Visible, Dynamic, Observe, Concrete | Agent positions/paths | Simulated movement on network |
| **Trafik (Live Transit)** | Visible, Dynamic, Observe, Concrete | Vehicle positions | Västtrafik API real-time |
| **Bird Sounds** | Invisible, Dynamic, Observe, Concrete | Audio events (spatial) | Proximity-triggered playback |
| **Grid Animation** | N/A (Reference), Static, Observe, N/A | Table tile boundaries | Configuration geometry |
| **Street Glow** | Visible, Dynamic, Observe, Concrete | Street network hierarchy | GeoJSON network data |
| **Slideshow** | Visible, Static, Observe, Concrete | Images/video/GeoJSON | Media files |

---

### Table 15: Visual Encoding Vocabulary by Layer

| Layer | Point/Dot | Marker/Icon | Line/Path | Area/Polygon | Particle | Colour | Glow/Shadow | Animation |
|-------|-----------|-------------|-----------|--------------|----------|--------|-------------|-----------|
| **CFD Simulation** | ● | – | – | – | ●● | Speed gradient (yellow→red) | Particle glow, blur | Advection flow |
| **Isovist** | Viewer point | – | Direction line, path trace | Visibility polygon, gradient rings | – | Yellow fill, pink outline | Breathing glow | Polygon update on move |
| **Sun Study** | – | – | – | Building footprints | – | False colour option | Cast shadows | Time-based shadow sweep |
| **Stormwater Flow** | – | – | – | – | ●● | Blue with pooling intensity | Pooling glow effect | Flow along terrain |
| **Street Life** | – | ●● | Trail paths | – | – | Type-coded (car/bus/taxi) | Headlights, streetlights | Entity movement |
| **Trafik** | – | ●● | Trail history | – | – | Mode-coded (bus/tram) | Vehicle glow | Interpolated movement |
| **Bird Sounds** | Sensor markers | Species icons | – | – | ● | Species-coded colours | Pulsing rings | Appearance on trigger |
| **Grid Animation** | Corner nodes | – | Grid lines | – | – | Cyan | Multi-layer glow | Pulse/wave animation |
| **Street Glow** | – | – | ●● | – | Flow particles | Type hierarchy colours | Segment glow | Progressive reveal |
| **Slideshow** | – | – | – | – | – | Media content | – | Transitions (fade, slide, zoom) |

**Legend**: ● = Present, ●● = Primary encoding method, – = Not used

---

### Table 16: Detailed Visual Encoding Parameters

| Layer | Element | Size | Colour Scheme | Opacity | Additional Effects |
|-------|---------|------|---------------|---------|-------------------|
| **CFD Simulation** | Particle | 2-3px dynamic | RGB(255, 255-speed×100, 150-speed×150) | Age-based fade (0→1→0) | shadowBlur: 10px |
| **Isovist** | Polygon fill | — | #ffd500 (yellow) | 0.1 per ring band | 5-layer gradient |
| **Isovist** | Outline | 16px | #ff0099 (pink) | 1.0 | Dashed (2,2), breathing glow |
| **Isovist** | Viewer | 4px radius | #ff0000 (red) | 1.0 | White stroke |
| **Sun Study** | Shadow | — | Black/transparent | 0.8 adjustable | Soft shadow edges |
| **Stormwater** | Particle | 2px base | rgba(0, 150, 255, 0.7) | 0.7 base | Pooling glow ×1.2 |
| **Street Life** | Car | 12×6px | Palette: cyan, white, blue, teal, purple | 1.0 | Headlights, taillights |
| **Street Life** | Bus | 22×7px | Gold #ffcc00, Blue #0088cc | 1.0 | Window lights |
| **Street Life** | Pedestrian | 4px | Ghostly greys with cyan accents | 0.7 | — |
| **Street Life** | Streetlight | 60px radius | rgba(255, 210, 150, 0.6) | 0.6 | Warm sodium glow |
| **Trafik** | Vehicle | 16px | BUS: #00A5E0, TRAM: #FFD700 | 1.0 | 28px glow radius |
| **Trafik** | Trail | 5px width | Mode-coded, 0.3 opacity | 0.8→0.3 fade | 500-point history |
| **Bird Sounds** | Sensor | Variable | Species: Gold, Sky Blue, Orange Red | 1.0 | Pulsing expansion |
| **Grid** | Lines | 3-7px multi-layer | rgba(0, 255, 255, α) | 0.3 base + pulse | shadowBlur: 15-35px |
| **Grid** | Nodes | 4-6px radius | Cyan | 0.6-1.0 pulse | Outer ring stroke |
| **Street Glow** | Segment | 3-7px | Type-coded palette | Base + pulse | Type-reveal animation |

---

### Table 17: Audio Design by Layer

| Layer | Audio Type | Sound Source | Trigger | Volume Control | Spatial | Data Mapping |
|-------|------------|--------------|---------|----------------|---------|--------------|
| **CFD Simulation** | Ambient | wind.mp3 | Layer activation | Fixed | No | Presence only |
| **Isovist** | Data-driven blend | Nature + City sounds | Continuous | GVF-based | No | Green View Factor → nature/city ratio |
| **Sun Study** | None | — | — | — | — | — |
| **Stormwater Flow** | Ambient | rain.mp3 | Layer activation | Fixed | No | Presence only |
| **Street Life** | Ambient | city.mp3 | Layer activation | Fade in/out | No | Presence only |
| **Trafik** | None | — | — | — | — | — |
| **Bird Sounds** | Event-based | 3 bird species MP3s | Proximity/timer | Master + per-source | Yes (positioned) | Species selection, timing |
| **Grid Animation** | None | — | — | — | — | — |
| **Street Glow** | None | — | — | — | — | — |
| **Slideshow** | None | — | — | — | — | — |

**Audio Legend**:
- *Ambient*: Background soundscape, always playing when active
- *Data-driven*: Audio parameters respond to computed values
- *Event-based*: Discrete sounds triggered by specific conditions
- *GVF*: Green View Factor (ratio of tree-blocked rays to total rays)

---

### Table 18: Interaction Capabilities by Layer

| Layer | Paradigm | Input | Cursor/Position | Time Control | Parameter Adjustment | Toggle States |
|-------|----------|-------|-----------------|--------------|---------------------|---------------|
| **CFD Simulation** | Passive Observation | Button | — | — | Wind speed, Trees on/off | Active/Inactive |
| **Isovist** | Cursor-following (Embodied) | Mouse/Touch | Viewer follows cursor | — | FOV, View distance, Trees | Active, Sound on/off |
| **Sun Study** | Parametric Control | Remote | — | Date slider, Time slider | Shadow opacity, Offset/Scale | Active, Trees, False colour |
| **Stormwater Flow** | Passive Observation | Button | — | — | — | Active/Inactive |
| **Street Life** | Passive Observation | Button | — | — | — | Active/Inactive |
| **Trafik** | Passive Observation | Button | — | — | — | Active/Inactive |
| **Bird Sounds** | Proximity Trigger | Button | — | — | Master volume | Active/Inactive |
| **Grid Animation** | Passive Observation | Button | — | — | — | Active (auto-stops 10s) |
| **Street Glow** | Passive Observation | Button | — | — | — | Active/Inactive |
| **Slideshow** | Toggle/Mode Switch | Remote | — | — | — | Active, slide navigation |

---

### Table 19: Data-to-Visual Mapping Examples

| Phenomenon | Data Variable | Visual Encoding | Why This Works |
|------------|---------------|-----------------|----------------|
| **Wind speed** | Velocity magnitude (m/s) | Particle colour gradient (yellow→red) | Intuitive "heat" metaphor |
| **Wind direction** | Velocity vector | Particle movement direction | Direct spatial correspondence |
| **Visibility extent** | Ray intersection distance | Polygon boundary | Shape = what you can see |
| **Green View Factor** | Tree ray ratio | Audio blend (nature↔city) | Ecological sonification |
| **Shadow extent** | Light occlusion | Dark overlay | Direct representation |
| **Water accumulation** | Flow convergence | Pooling glow intensity | Brighter = more water |
| **Vehicle type** | Category | Colour coding | Categorical distinction |
| **Transit mode** | Category | Icon shape + colour | Redundant encoding |
| **Bird species** | Category | Sound file + colour | Multi-sensory redundancy |
| **Street hierarchy** | Road type | Colour palette | Categorical ordering |

---

### Table 20: Dynamism Characteristics by Layer

| Layer | Update Frequency | Animation Type | Temporal Resolution | Continuity |
|-------|-----------------|----------------|--------------------|-|
| **CFD Simulation** | ~60 FPS | Continuous simulation | Real-time (accelerated physics) | Continuous |
| **Isovist** | On cursor move | Reactive computation | Immediate | Event-driven |
| **Sun Study** | On parameter change | Discrete update | 15-min increments typical | Stepped |
| **Stormwater Flow** | ~60 FPS | Continuous particles | Real-time | Continuous |
| **Street Life** | ~60 FPS | Entity interpolation | Real-time (simulated) | Continuous |
| **Trafik** | 3-second API poll | Smooth interpolation | 3-second resolution, smoothed | Interpolated |
| **Bird Sounds** | Timer-based (10-30s) | Event appearance | Event-driven | Discrete events |
| **Grid Animation** | ~60 FPS | Decorative pulse | Real-time | Continuous |
| **Street Glow** | ~60 FPS | Progressive reveal | Real-time | Continuous |
| **Slideshow** | Per-slide duration | Transition animation | Configurable | Stepped |

---

### Summary: Visualisation Vocabulary Quick Reference

**Point-based encodings**: CFD particles, Isovist viewer marker, Bird sound sensors, Grid corner nodes

**Line-based encodings**: Isovist direction indicator, Street paths, Vehicle trails, Grid lines, Street network segments

**Area-based encodings**: Isovist visibility polygon, Sun study shadows, Building footprints

**Movement encodings**: CFD particle advection, Stormwater particle flow, Street life entity movement, Transit vehicle interpolation

**Colour encodings**: Speed gradients, Type categories, Hierarchy levels, Mode distinctions

**Glow/light effects**: CFD particle glow, Streetlights, Headlights, Grid pulse, Street segment glow, Pooling intensity

**Audio encodings**: Ambient presence, Data-driven blend (GVF→soundscape), Spatial event triggers

**Temporal encodings**: Continuous simulation, Parametric time control, Progressive reveal, Discrete events

---