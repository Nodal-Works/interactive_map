# TypeScript Modular Architecture

This document describes the new TypeScript-based modular architecture for the ACE MR Studio Interactive Map.

## Overview

The application has been refactored to use TypeScript with a scalable, modular class-based architecture. This provides:

- **Type Safety**: Catch errors at compile time
- **Modularity**: Each animation is a self-contained class
- **Reusability**: Common functionality is shared via base classes
- **Maintainability**: Clear separation of concerns
- **Scalability**: Easy to add new animations

## Architecture

### Directory Structure

```
src/
├── core/                    # Base classes
│   ├── BaseAnimation.ts     # Abstract base for all animations
│   ├── CanvasAnimation.ts   # Base for canvas-based animations
│   └── MapAnimation.ts      # Base for map-dependent animations
├── utils/                   # Utility modules
│   ├── GeoUtils.ts          # Geospatial calculations (Haversine, etc.)
│   └── ChannelMessenger.ts  # BroadcastChannel singleton
├── types/                   # TypeScript type definitions
│   └── index.ts             # Shared interfaces and enums
├── animations/              # Animation implementations
│   ├── GridAnimation.ts
│   ├── StreetGlowAnimation.ts
│   └── ... (more to come)
├── AnimationRegistry.ts     # Central animation management
└── main.ts                  # Application entry point
```

### Core Classes

#### BaseAnimation

Abstract base class providing:
- Lifecycle management (start/stop/toggle)
- Button event handling
- BroadcastChannel messaging
- State tracking

#### CanvasAnimation

Extends `BaseAnimation` for canvas-based visualizations:
- Canvas creation and resizing
- Animation loop management
- Overlay pixel size calculation
- Performance optimization

#### MapAnimation

Extends `CanvasAnimation` for map-dependent animations:
- Geographic to screen coordinate projection
- Map property access (bearing, zoom, etc.)
- Viewport visibility checks
- Map interaction utilities

### Animation Registry

Central singleton for managing all animations:
- Registration/unregistration
- Starting/stopping animations
- Preventing multiple active animations
- Resource cleanup

### Utilities

#### GeoUtils

Shared geospatial functions:
- `distance()` - Haversine distance calculation
- `destination()` - Calculate destination from origin + bearing
- `bearing()` - Calculate bearing between points
- `interpolate()` - Geographic coordinate interpolation
- Math helpers (clamp, lerp, mapRange)

#### ChannelMessenger

BroadcastChannel wrapper:
- Type-safe message passing
- Event subscription/unsubscription
- Wildcard message handlers
- Singleton pattern

## Building

### Development

```bash
# Install dependencies
npm install

# Build TypeScript (watch mode)
npm run build:watch

# Serve locally
npm run serve

# Development mode (build + serve)
npm run dev
```

### Production

```bash
# Clean build
npm run clean
npm run build
```

Built files are output to `dist/`:
- `dist/main.js` - Main application
- `dist/animations/*.js` - Animation modules
- `dist/core/*.js` - Base classes
- `dist/utils/*.js` - Utilities
- Plus HTML, CSS, and media assets

## Creating New Animations

### Canvas-based Animation

```typescript
import { CanvasAnimation, type CanvasAnimationConfig } from '../core/CanvasAnimation.js';

export class MyAnimation extends CanvasAnimation {
  constructor(config: CanvasAnimationConfig) {
    super(config);
  }

  protected animate(): void {
    // Draw to this.ctx
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // ... your drawing code
  }
}
```

### Map-based Animation

```typescript
import { MapAnimation, type MapAnimationConfig } from '../core/MapAnimation.js';

export class MyMapAnimation extends MapAnimation {
  constructor(config: MapAnimationConfig) {
    super(config);
  }

  protected animate(): void {
    // Access map via this.map
    const center = this.getMapCenter();
    const screen = this.projectToScreen(lng, lat);
    // ... your animation code
  }
}
```

### Register Animation

In `src/main.ts`:

```typescript
import { MyAnimation } from './animations/MyAnimation.js';

const myAnimation = new MyAnimation({
  id: 'my-animation',
  name: 'My Animation',
  buttonId: 'my-animation-btn',
  canvasId: 'my-animation-canvas',
  zIndex: 850,
  map,
});

animationRegistry.register(myAnimation);
```

## Migration Status

### ✅ Completed

- TypeScript infrastructure
- Core base classes
- Utility modules
- Animation registry
- GridAnimation
- StreetGlowAnimation

### 🚧 In Progress

- BirdSoundsAnimation
- SlideshowAnimation
- CampusDemoAnimation
- StreetLifeAnimation
- TrafikAnimation
- IsovistAnimation
- CFDSimulation
- StormwaterFlowAnimation
- SunStudyAnimation
- StreetViewAnimation
- FCCDemoAnimation

### 📋 Future Enhancements

- Unit tests for core classes
- Integration tests for animations
- Performance profiling
- Code documentation generation (TypeDoc)
- CI/CD pipeline
- Linting and formatting setup (ESLint + Prettier)

## Type Definitions

The project uses strict TypeScript configuration:
- Strict null checks
- No implicit any
- No unused variables/parameters
- All imports are explicit

Key types are defined in `src/types/index.ts`:
- `IAnimation` - Animation interface
- `MessageType` - BroadcastChannel message types
- `MapCalibration` - Map configuration
- `CanvasDimensions`, `GeoCoordinate`, etc.

## Browser Support

The compiled code targets ES2020 and uses ES modules. Supported browsers:
- Chrome/Edge 88+
- Firefox 78+
- Safari 14+

## Performance Considerations

- Animation loops use `requestAnimationFrame`
- Canvas operations are batched where possible
- GeoJSON features are sampled for large datasets
- Only one animation active at a time
- Automatic cleanup on animation stop

## Contributing

When adding new animations:
1. Extend appropriate base class
2. Implement `animate()` method
3. Add configuration interface
4. Register in `main.ts`
5. Update this documentation
6. Test in all browsers

## Questions?

See the main [README.md](../README.md) for general project information.
