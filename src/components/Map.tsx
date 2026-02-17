import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useApp } from '@/contexts/AppContext';
import { BasemapType, BasemapConfig } from '@types';

const basemaps: Record<BasemapType, BasemapConfig> = {
  osm: {
    id: 'osm-source',
    tiles: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
    attribution: '&copy; OpenStreetMap contributors',
  },
  cartoPositron: {
    id: 'carto-pos-source',
    tiles: [
      'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
    ],
    tileSize: 256,
    attribution: '&copy; CARTO',
  },
  cartoDark: {
    id: 'carto-dark-source',
    tiles: [
      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
    ],
    tileSize: 256,
    attribution: '&copy; CARTO',
  },
  esriSatellite: {
    id: 'esri-sat-source',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
    attribution: '&copy; Esri',
  },
  openTopo: {
    id: 'opentopo-source',
    tiles: [
      'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
    attribution: '&copy; OpenTopoMap',
  },
};

const MapComponent = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const { map, setMap, calibration, currentBasemap } = useApp();

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [],
      },
      center: [calibration.center.lng, calibration.center.lat],
      zoom: calibration.zoom,
      bearing: calibration.bearing,
      pitch: calibration.pitch || 0,
    });

    mapInstance.on('load', () => {
      setMap(mapInstance);
    });

    return () => {
      mapInstance.remove();
      setMap(null);
    };
  }, [calibration, setMap]);

  useEffect(() => {
    if (!map) return;

    const config = basemaps[currentBasemap];
    
    // Remove existing basemap layers and sources
    Object.values(basemaps).forEach((bm) => {
      if (map.getLayer(bm.id + '-layer')) {
        map.removeLayer(bm.id + '-layer');
      }
      if (map.getSource(bm.id)) {
        map.removeSource(bm.id);
      }
    });

    // Add new basemap
    map.addSource(config.id, {
      type: 'raster',
      tiles: config.tiles,
      tileSize: config.tileSize,
      attribution: config.attribution,
    });

    map.addLayer({
      id: config.id + '-layer',
      type: 'raster',
      source: config.id,
      paint: {},
    });
  }, [map, currentBasemap]);

  return <div ref={mapContainerRef} id="map" style={{ width: '100%', height: '100%' }} />;
};

export default MapComponent;
