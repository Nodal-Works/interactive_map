# Interactive Map (interactive_map)

This is a small, self-contained interactive map using Leaflet. It lives in `interactive_map/`.

What it provides
- `index.html` — the web page with a Leaflet map
- `style.css` — minimal styling and layout
- `main.js` — map initialization, base layers, scale, and GeoJSON loader (file input + drag/drop)

How to run

1. Quick (open file locally):

   - You can open `interactive_map/index.html` directly in a browser, but some browsers block local file requests for scripts or XHR. If the map doesn't show tiles or scripts, use the local server option below.

2. Recommended (local server):

   Run a simple HTTP server from the repo root (macOS/Linux):

   ```
   python3 -m http.server 8000
   ```

   Then open http://localhost:8000/interactive_map/ in your browser.

- Using the app
- Switch base layers using the control in the top-right of the map. Available base maps include OpenStreetMap, CartoDB Positron, CartoDB Dark, Esri World Imagery (satellite), Stamen Terrain, Stamen Toner, and OpenTopoMap (topographic).
- Use the "Load GeoJSON" button to select a GeoJSON file from disk.
- You can also drag & drop a `.geojson` or `.json` file directly onto the map.

Next steps / optional enhancements
- Add marker clustering for large point datasets (Leaflet.markercluster)
- Support vector tiles with MapLibre GL for high-performance large datasets
- Add a fullscreen control and permalink / shareable view
- Convert to a small web app (React/Vue) if you want more UI features
