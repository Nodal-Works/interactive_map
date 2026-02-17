/**
 * Main application entry point
 * Initializes the map and animation system
 */

import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MapCalibration } from './types/index.js';
import { animationRegistry } from './AnimationRegistry.js';
import { GridAnimation } from './animations/GridAnimation.js';
import { StreetGlowAnimation } from './animations/StreetGlowAnimation.js';

/**
 * Global function to compute overlay pixel size based on physical dimensions
 */
window.computeOverlayPixelSize = function() {
  const SCREEN_WIDTH_CM = 111.93;
  const TABLE_WIDTH_CM = 100;
  const TABLE_HEIGHT_CM = 60;
  
  const pxPerCm = window.innerWidth / SCREEN_WIDTH_CM;
  const w = Math.round(TABLE_WIDTH_CM * pxPerCm);
  const h = Math.round(TABLE_HEIGHT_CM * pxPerCm);
  
  return { w, h };
};

/**
 * Load map calibration data
 */
async function loadCalibration(): Promise<MapCalibration> {
  // Default fallback values
  const defaults: MapCalibration = {
    center: {
      lng: 11.977770568930168,
      lat: 57.68839377903814,
    },
    zoom: 15.806953679037164,
    bearing: -92.58546386659737,
    pitch: 0,
  };

  try {
    const response = await fetch('map-calibration.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const calibration = await response.json() as MapCalibration;
    console.log('✓ Loaded map calibration from map-calibration.json');
    return calibration;
  } catch (e) {
    console.warn('Could not load map-calibration.json, using defaults:', e);
    return defaults;
  }
}

/**
 * Initialize MapLibre map
 */
async function initializeMap(): Promise<MapLibreMap> {
  const calibration = await loadCalibration();

  // Cast to any to access the MapLibre constructor
  const MapLibreGL = (window as any).maplibregl;
  
  const map = new MapLibreGL.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {},
      layers: [],
    },
    center: [calibration.center.lng, calibration.center.lat],
    zoom: calibration.zoom,
    bearing: calibration.bearing,
    pitch: calibration.pitch ?? 0,
  }) as MapLibreMap;

  // Disable default interactions (map is calibrated for projection)
  map.on('load', () => {
    map.dragPan.disable();
    map.doubleClickZoom.disable();
    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    map.touchZoomRotate.disable();
    console.log('✓ Map interactions disabled (calibrated for projection)');
  });

  return map;
}

/**
 * Setup basemap layers
 */
function setupBasemaps(map: MapLibreMap): void {
  const basemaps = {
    osm: {
      id: 'osm-source',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
    },
    cartoPositron: {
      id: 'carto-pos-source',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
    },
    cartoDark: {
      id: 'carto-dark-source',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
    },
    esri: {
      id: 'esri-source',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
    },
    opentopo: {
      id: 'opentopo-source',
      tiles: [
        'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
    },
  };

  map.on('load', () => {
    Object.entries(basemaps).forEach(([key, bm]) => {
      map.addSource(bm.id, {
        type: 'raster',
        tiles: bm.tiles,
        tileSize: bm.tileSize,
      });
      map.addLayer({
        id: bm.id + '-layer',
        type: 'raster',
        source: bm.id,
        layout: { visibility: key === 'cartoDark' ? 'visible' : 'none' },
      });
    });
    console.log('✓ Basemap layers configured');
  });
}

/**
 * Initialize animations
 */
function initializeAnimations(map: MapLibreMap): void {
  // Grid Animation
  const gridAnimation = new GridAnimation({
    id: 'grid-animation',
    name: 'Grid Animation',
    buttonId: 'grid-animation-btn',
    canvasId: 'grid-animation-canvas',
    zIndex: 850,
  });
  animationRegistry.register(gridAnimation);

  // Street Glow Animation
  const streetGlowAnimation = new StreetGlowAnimation({
    id: 'street-glow-animation',
    name: 'Street Glow Animation',
    canvasId: 'street-animation-canvas',
    zIndex: 850,
    map,
    dataPath: 'media/street-network.geojson',
  });
  animationRegistry.register(streetGlowAnimation);

  console.log('✓ Animations initialized');
}

/**
 * Handle audio context unlock
 */
function setupAudioContext(): void {
  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('start-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        ctx.resume().then(() => {
          console.log('✓ AudioContext unlocked');
          overlay.style.opacity = '0';
          setTimeout(() => overlay.remove(), 500);
        });
      });
    }
  });
}

/**
 * Main application initialization
 */
async function main(): Promise<void> {
  console.log('🚀 ACE MR Studio Interactive Map - Starting...');
  
  // Setup audio context
  setupAudioContext();
  
  // Initialize map
  const map = await initializeMap();
  window.map = map;
  
  // Setup basemaps
  setupBasemaps(map);
  
  // Wait for map to load before initializing animations
  map.on('load', () => {
    initializeAnimations(map);
    console.log('✅ Application ready');
  });
}

// Start the application
main().catch((error) => {
  console.error('❌ Failed to initialize application:', error);
});
