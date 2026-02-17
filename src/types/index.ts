import type { Map as MapLibreMap } from 'maplibre-gl';

export interface MapCalibration {
  center: {
    lat: number;
    lng: number;
  };
  zoom: number;
  bearing: number;
  pitch?: number;
}

export interface AnimationBase {
  name: string;
  isActive: boolean;
  start: () => void;
  stop: () => void;
  cleanup?: () => void;
}

export interface MapComponentProps {
  map: MapLibreMap | null;
  calibration: MapCalibration;
}

export type BasemapType = 'osm' | 'cartoPositron' | 'cartoDark' | 'esriSatellite' | 'openTopo';

export interface BasemapConfig {
  id: string;
  tiles: string[];
  tileSize: number;
  attribution: string;
}

export interface AppContextType {
  map: MapLibreMap | null;
  setMap: (map: MapLibreMap | null) => void;
  calibration: MapCalibration;
  currentBasemap: BasemapType;
  setBasemap: (basemap: BasemapType) => void;
  activeAnimations: Set<string>;
  toggleAnimation: (name: string) => void;
}

export interface EventBusMessage {
  type: string;
  payload?: any;
}
