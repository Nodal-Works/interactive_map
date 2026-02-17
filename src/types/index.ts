/**
 * Shared TypeScript type definitions for the ACE MR Studio Interactive Map
 */

import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Animation lifecycle interface
 */
export interface IAnimation {
  /** Unique identifier for this animation */
  readonly id: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Whether the animation is currently active */
  isActive: boolean;
  
  /** Start the animation */
  start(): Promise<void> | void;
  
  /** Stop the animation */
  stop(): Promise<void> | void;
  
  /** Toggle animation on/off */
  toggle(): Promise<void> | void;
  
  /** Clean up resources */
  dispose(): void;
}

/**
 * BroadcastChannel message types
 */
export enum MessageType {
  // Outgoing (main -> controller)
  ANIMATION_STATE = 'animation_state',
  STATE_UPDATE = 'state_update',
  SLIDESHOW_UPDATE = 'slideshow_update',
  SLIDESHOW_LEGEND_HIGHLIGHT = 'slideshow_legend_highlight',
  BIRD_STATUS = 'bird_status',
  SUN_POSITION = 'sun_position',
  SUN_TIME_UPDATE = 'sun_time_update',
  CALIBRATION_DATA = 'calibration_data',
  FCC_DEMO_PROGRESS = 'fcc_demo_progress',
  FCC_DEMO_READY = 'fcc_demo_ready',
  FCC_DEMO_STATS = 'fcc_demo_stats',
  FCC_DEMO_PLAYBACK_STATE = 'fcc_demo_playback_state',
  SAM_SEGMENT = 'sam_segment',
  
  // Incoming (controller -> main)
  CONTROL_ACTION = 'control_action',
  RESET_VIEW = 'reset_view',
  CALIBRATE_ACTION = 'calibrate_action',
  SUN_CONTROL = 'sun_control',
  CFD_CONTROL = 'cfd_control',
  ISOVIST_CONTROL = 'isovist_control',
  BIRD_CONTROL = 'bird_control',
  SLIDESHOW_CONTROL = 'slideshow_control',
  FCC_DEMO_CONTROL = 'fcc_demo_control',
}

/**
 * Generic message structure
 */
export interface Message<T = any> {
  type: MessageType | string;
  data?: T;
  animationId?: string;
  isActive?: boolean;
}

/**
 * Animation state message
 */
export interface AnimationStateMessage extends Message {
  type: MessageType.ANIMATION_STATE;
  animationId: string;
  isActive: boolean;
}

/**
 * Canvas dimensions for overlay rendering
 */
export interface CanvasDimensions {
  width: number;
  height: number;
}

/**
 * Physical table dimensions (in cm)
 */
export interface TableDimensions {
  widthCm: number;
  heightCm: number;
  screenWidthCm: number;
  screenHeightCm: number;
}

/**
 * Map calibration data
 */
export interface MapCalibration {
  center: {
    lng: number;
    lat: number;
  };
  zoom: number;
  bearing: number;
  pitch?: number;
}

/**
 * Geographic coordinate
 */
export interface GeoCoordinate {
  lng: number;
  lat: number;
}

/**
 * Point in screen space
 */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Configuration for animations that need a canvas
 */
export interface CanvasConfig {
  canvasId: string;
  zIndex: number;
  pointerEvents?: boolean;
}

/**
 * Configuration for animations that need the map
 */
export interface MapConfig {
  map: MapLibreMap;
}

/**
 * Base animation configuration
 */
export interface AnimationConfig {
  id: string;
  name: string;
  buttonId?: string;
  enabled?: boolean;
}

/**
 * Vehicle types for transit visualization
 */
export enum VehicleType {
  BUS = 'bus',
  TRAM = 'tram',
  TRAIN = 'train',
  FERRY = 'ferry',
  CAR = 'car',
  BICYCLE = 'bicycle',
  TAXI = 'taxi',
  PEDESTRIAN = 'pedestrian',
}

/**
 * Audio configuration
 */
export interface AudioConfig {
  source: string;
  loop?: boolean;
  volume?: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
  fadeDuration?: number;
}

/**
 * Asset loading status
 */
export interface AssetLoadStatus {
  loaded: boolean;
  error?: Error;
  data?: any;
}

/**
 * Utility type for async functions that may return void
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Global window extensions
 */
declare global {
  interface Window {
    map?: MapLibreMap;
    computeOverlayPixelSize?: () => { w: number; h: number };
  }
}
