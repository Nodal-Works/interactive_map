import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { AppContextType, MapCalibration, BasemapType } from '@types';

const defaultCalibration: MapCalibration = {
  center: { lat: 57.68839377903814, lng: 11.977770568930168 },
  zoom: 15.806953679037164,
  bearing: -92.58546386659737,
  pitch: 0,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider = ({ children }: AppProviderProps) => {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [calibration, setCalibration] = useState<MapCalibration>(defaultCalibration);
  const [currentBasemap, setCurrentBasemap] = useState<BasemapType>('cartoDark');
  const [activeAnimations, setActiveAnimations] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load calibration from public folder
    fetch('/map-calibration.json')
      .then((res) => res.json())
      .then((data) => {
        setCalibration({
          center: { lat: data.center.lat, lng: data.center.lng },
          zoom: data.zoom,
          bearing: data.bearing,
          pitch: data.pitch || 0,
        });
      })
      .catch((error) => {
        console.warn('Could not load map-calibration.json, using defaults:', error);
      });
  }, []);

  const toggleAnimation = (name: string) => {
    setActiveAnimations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(name)) {
        newSet.delete(name);
      } else {
        newSet.add(name);
      }
      return newSet;
    });
  };

  const setBasemap = (basemap: BasemapType) => {
    setCurrentBasemap(basemap);
  };

  return (
    <AppContext.Provider
      value={{
        map,
        setMap,
        calibration,
        currentBasemap,
        setBasemap,
        activeAnimations,
        toggleAnimation,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
