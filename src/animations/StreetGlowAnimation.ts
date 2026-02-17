/**
 * Street Network Glow Animation
 * Animated glowing paths along street network GeoJSON
 */

import { MapAnimation, type MapAnimationConfig } from '../core/MapAnimation.js';
import type { Feature, LineString, MultiLineString, FeatureCollection } from 'geojson';

/**
 * Street segment data structure
 */
interface StreetSegment {
  start: { lng: number; lat: number };
  end: { lng: number; lat: number };
  type: string;
}

/**
 * Street type color palette
 */
const STREET_COLORS: Record<string, string> = {
  motorway: 'rgba(255, 50, 50, ',
  trunk: 'rgba(255, 120, 50, ',
  primary: 'rgba(255, 200, 50, ',
  secondary: 'rgba(50, 255, 150, ',
  tertiary: 'rgba(50, 180, 255, ',
  unclassified: 'rgba(180, 150, 255, ',
  residential: 'rgba(50, 255, 100, ',
  living_street: 'rgba(200, 255, 50, ',
  service: 'rgba(220, 220, 220, ',
  pedestrian: 'rgba(255, 100, 255, ',
  footway: 'rgba(255, 80, 255, ',
  cycleway: 'rgba(100, 255, 255, ',
  path: 'rgba(150, 255, 150, ',
  track: 'rgba(200, 200, 120, ',
  default: 'rgba(180, 180, 180, ',
};

/**
 * Street glow animation configuration
 */
interface StreetGlowAnimationConfig extends MapAnimationConfig {
  dataPath?: string;
  maxParticles?: number;
  maxSegments?: number;
  typeRevealInterval?: number;
}

/**
 * Street glow animation class
 */
export class StreetGlowAnimation extends MapAnimation {
  private streetSegments: StreetSegment[] = [];
  private segmentsByType: Record<string, StreetSegment[]> = {};
  private streetTypes: string[] = [];
  private visibleStreetTypes: string[] = [];
  private animationStartTime: number = 0;
  private dataLoaded: boolean = false;
  private dataPath: string;
  private maxSegments: number;
  private typeRevealInterval: number;
  private autoStopTimer: number | null = null;

  constructor(config: StreetGlowAnimationConfig) {
    super(config);
    this.dataPath = config.dataPath ?? 'media/street-network.geojson';
    this.maxSegments = config.maxSegments ?? 3000;
    this.typeRevealInterval = config.typeRevealInterval ?? 500; // ms per type reveal
  }

  /**
   * Load street network data
   */
  private async loadStreetData(): Promise<void> {
    try {
      const response = await fetch(this.dataPath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const geojson = await response.json() as FeatureCollection;
      this.parseStreetGeoJSON(geojson);
      this.dataLoaded = true;
      console.log(`✓ Loaded ${this.streetSegments.length} street segments from ${this.dataPath}`);
    } catch (err) {
      console.warn(`Could not load ${this.dataPath}:`, err);
      console.log('Street animation will require manually loaded GeoJSON');
      throw err;
    }
  }

  /**
   * Parse GeoJSON and extract line segments with type info
   */
  private parseStreetGeoJSON(geojson: FeatureCollection): void {
    this.streetSegments = [];
    this.segmentsByType = {};
    const typeSet = new Set<string>();

    if (!geojson || !geojson.features) return;

    geojson.features.forEach((feature: Feature) => {
      const highway = (feature.properties?.highway as string) || 'default';
      typeSet.add(highway);

      if (!this.segmentsByType[highway]) {
        this.segmentsByType[highway] = [];
      }

      if (feature.geometry.type === 'LineString') {
        const coords = (feature.geometry as LineString).coordinates;
        for (let i = 0; i < coords.length - 1; i++) {
          const segment: StreetSegment = {
            start: { lng: coords[i]![0]!, lat: coords[i]![1]! },
            end: { lng: coords[i + 1]![0]!, lat: coords[i + 1]![1]! },
            type: highway,
          };
          this.streetSegments.push(segment);
          this.segmentsByType[highway]!.push(segment);
        }
      } else if (feature.geometry.type === 'MultiLineString') {
        (feature.geometry as MultiLineString).coordinates.forEach((line) => {
          for (let i = 0; i < line.length - 1; i++) {
            const segment: StreetSegment = {
              start: { lng: line[i]![0]!, lat: line[i]![1]! },
              end: { lng: line[i + 1]![0]!, lat: line[i + 1]![1]! },
              type: highway,
            };
            this.streetSegments.push(segment);
            this.segmentsByType[highway]!.push(segment);
          }
        });
      }
    });

    this.streetTypes = Array.from(typeSet);
    console.log(`Parsed ${this.streetSegments.length} street segments with ${this.streetTypes.length} types:`, this.streetTypes);
  }

  /**
   * Draw the glowing street network
   */
  private drawStreetGlow(time: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Calculate time relative to animation start
    const elapsed = time - this.animationStartTime;
    const baseGlow = 0.5 + Math.sin(elapsed * 0.001) * 0.25;

    // Incrementally reveal street types
    const targetTypes = Math.min(this.streetTypes.length, Math.floor(elapsed / this.typeRevealInterval) + 1);
    this.visibleStreetTypes = this.streetTypes.slice(0, targetTypes);

    // Draw each visible type in batches
    this.visibleStreetTypes.forEach((type, typeIndex) => {
      const segments = this.segmentsByType[type] || [];
      if (segments.length === 0) return;

      // Type reveal fade-in effect
      const revealProgress = Math.min(1, elapsed / this.typeRevealInterval - typeIndex);
      const fadeIn = Math.max(0, Math.min(1, revealProgress));

      if (fadeIn <= 0) return;

      // Get color for this street type
      const colorBase = STREET_COLORS[type] ?? STREET_COLORS.default!;

      // Sample segments for performance
      const sampleRate = Math.max(1, Math.ceil(segments.length / this.maxSegments));

      // Set styles once per type
      const pulse = Math.sin(elapsed * 0.003 + typeIndex) * 0.4 + 0.6;
      this.ctx.strokeStyle = colorBase + (baseGlow * pulse * 0.8 * fadeIn) + ')';
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = colorBase + (pulse * 0.9 * fadeIn) + ')';
      this.ctx.lineCap = 'round';

      // Begin a single path for all segments of this type
      this.ctx.beginPath();

      for (let i = 0; i < segments.length; i += sampleRate) {
        const segment = segments[i]!;
        const start = this.projectToScreen(segment.start.lng, segment.start.lat);
        const end = this.projectToScreen(segment.end.lng, segment.end.lat);

        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
      }

      // Draw all segments of this type at once
      this.ctx.stroke();
    });

    this.ctx.shadowBlur = 0;

    // Draw legend showing current types
    this.drawLegend();
  }

  /**
   * Draw type legend
   */
  private drawLegend(): void {
    this.ctx.font = '12px system-ui';
    this.ctx.textAlign = 'left';
    let yOffset = 20;

    this.visibleStreetTypes.forEach((type) => {
      const colorBase = STREET_COLORS[type] ?? STREET_COLORS.default!;
      this.ctx.fillStyle = colorBase + '0.8)';
      this.ctx.fillRect(10, yOffset - 8, 30, 3);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      this.ctx.fillText(type, 45, yOffset);
      yOffset += 18;
    });
  }

  /**
   * Animation loop
   */
  protected animate(): void {
    const time = performance.now();
    this.drawStreetGlow(time);
  }

  /**
   * Start the animation
   */
  public async start(): Promise<void> {
    // Load data if not already loaded
    if (!this.dataLoaded && this.streetSegments.length === 0) {
      try {
        await this.loadStreetData();
      } catch (err) {
        alert('No street network data found!\n\n' +
              '1. Make sure media/street-network.geojson exists, or\n' +
              '2. Load a GeoJSON file with street LineStrings');
        return;
      }
    }

    if (this.streetSegments.length === 0) {
      alert('No street network data available');
      return;
    }

    // Reset state
    this.visibleStreetTypes = [];
    this.animationStartTime = performance.now();

    super.start();

    // Auto-stop after all types revealed + 5 seconds
    const revealDuration = this.streetTypes.length * this.typeRevealInterval + 5000;
    this.autoStopTimer = window.setTimeout(() => {
      if (this.isActive) {
        this.stop();
      }
    }, revealDuration);
  }

  /**
   * Stop the animation
   */
  public stop(): void {
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    super.stop();
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    super.dispose();
  }
}
