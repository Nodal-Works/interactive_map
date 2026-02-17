/**
 * Base class for animations that interact with the MapLibre map
 */

import { CanvasAnimation, type CanvasAnimationConfig } from './CanvasAnimation.js';
import type { MapConfig } from '../types/index.js';
import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Configuration for map-based animations
 */
export interface MapAnimationConfig extends CanvasAnimationConfig, MapConfig {}

/**
 * Base class for map-dependent animations
 */
export abstract class MapAnimation extends CanvasAnimation {
  protected map: MapLibreMap;

  constructor(config: MapAnimationConfig) {
    super(config);
    this.map = config.map;
  }

  /**
   * Convert geographic coordinates to screen pixels
   */
  protected projectToScreen(lng: number, lat: number): { x: number; y: number } {
    const point = this.map.project([lng, lat]);
    
    // Get map container position
    const mapContainer = this.map.getContainer();
    const rect = mapContainer.getBoundingClientRect();
    
    // Convert to canvas space (centered)
    const canvasCenterX = this.canvas.width / 2;
    const canvasCenterY = this.canvas.height / 2;
    const mapCenterX = rect.width / 2;
    const mapCenterY = rect.height / 2;
    
    return {
      x: canvasCenterX + (point.x - mapCenterX),
      y: canvasCenterY + (point.y - mapCenterY),
    };
  }

  /**
   * Convert screen pixels to geographic coordinates
   */
  protected unprojectFromScreen(x: number, y: number): [number, number] {
    // Get map container position
    const mapContainer = this.map.getContainer();
    const rect = mapContainer.getBoundingClientRect();
    
    // Convert from canvas space to map space
    const canvasCenterX = this.canvas.width / 2;
    const canvasCenterY = this.canvas.height / 2;
    const mapCenterX = rect.width / 2;
    const mapCenterY = rect.height / 2;
    
    const mapX = mapCenterX + (x - canvasCenterX);
    const mapY = mapCenterY + (y - canvasCenterY);
    
    const lngLat = this.map.unproject([mapX, mapY]);
    return [lngLat.lng, lngLat.lat];
  }

  /**
   * Get current map bearing (rotation) in degrees
   */
  protected getMapBearing(): number {
    return this.map.getBearing();
  }

  /**
   * Get current map zoom level
   */
  protected getMapZoom(): number {
    return this.map.getZoom();
  }

  /**
   * Get map center coordinates
   */
  protected getMapCenter(): [number, number] {
    const center = this.map.getCenter();
    return [center.lng, center.lat];
  }

  /**
   * Check if a coordinate is visible in current viewport
   */
  protected isCoordinateVisible(lng: number, lat: number): boolean {
    const bounds = this.map.getBounds();
    return bounds.contains([lng, lat]);
  }
}
