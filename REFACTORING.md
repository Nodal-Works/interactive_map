# React + TypeScript Refactoring Guide

## Overview

This repository has been refactored from a monolithic vanilla JavaScript application to a modular React + TypeScript architecture. This document explains the new structure and how to work with it.

## What Changed?

### Before (Monolithic)
- Pure vanilla JavaScript with global namespace pollution
- 866-line `main.js` file with all core logic
- 190KB `controller.js` with mixed concerns
- 11 separate animation scripts loaded via `<script>` tags
- No type safety or build process
- Dependencies loaded via CDN
- Communication via window globals and BroadcastChannel

### After (Modular)
- TypeScript-first React application
- Component-based architecture with clear boundaries
- Centralized state management via React Context
- Custom EventBus for cross-component communication
- Type-safe interfaces for all components
- npm-based dependency management
- Vite build system with hot module replacement

## New Directory Structure

```
interactive_map/
├── src/
│   ├── animations/          # Animation components
│   │   └── GridAnimation.tsx
│   ├── components/          # UI components
│   │   ├── Map.tsx         # MapLibre GL wrapper
│   │   ├── LeftSidebar.tsx
│   │   ├── RightSidebar.tsx
│   │   └── StartOverlay.tsx
│   ├── contexts/           # React contexts
│   │   └── AppContext.tsx  # Global app state
│   ├── hooks/              # Custom React hooks
│   │   └── useAnimation.ts # Animation lifecycle hook
│   ├── types/              # TypeScript definitions
│   │   └── index.ts
│   ├── utils/              # Utility functions
│   │   ├── EventBus.ts    # Event system
│   │   └── helpers.ts     # Helper functions
│   ├── App.tsx             # Main app component
│   ├── App.css             # Styles
│   └── main.tsx            # Entry point
├── public/                 # Static assets
│   ├── media/
│   └── map-calibration.json
├── legacy/                 # Original vanilla JS files (backup)
│   ├── index.html
│   ├── main.js
│   ├── controller.js
│   └── ...
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html              # New React entry point
```

## Key Architectural Improvements

### 1. Type Safety
All components, hooks, and utilities are written in TypeScript with strict type checking enabled.

```typescript
interface MapComponentProps {
  map: MapLibreMap | null;
  calibration: MapCalibration;
}
```

### 2. Component-Based Architecture
Each feature is a self-contained component with clear props and lifecycle.

```tsx
const GridAnimation = () => {
  const { map } = useApp();
  
  useAnimation({
    name: 'grid-animation',
    onStart: () => { /* ... */ },
  });
  
  return null;
};
```

### 3. Centralized State Management
The `AppContext` manages global state, eliminating window globals.

```tsx
const { 
  map, 
  calibration, 
  activeAnimations, 
  toggleAnimation 
} = useApp();
```

### 4. EventBus System
Replaces scattered BroadcastChannel usage with a unified event system.

```typescript
eventBus.emit('animation:start', { name: 'cfd-simulation' });
eventBus.on('animation:start', (message) => { /* ... */ });
```

### 5. Animation Lifecycle Hook
The `useAnimation` hook manages animation start/stop/cleanup automatically.

```typescript
useAnimation({
  name: 'my-animation',
  onStart: () => ({
    name: 'my-animation',
    isActive: true,
    start: () => { /* initialization */ },
    stop: () => { /* cleanup */ },
  }),
});
```

## Development Workflow

### Install Dependencies
```bash
npm install
```

### Development Server
```bash
npm run dev
# Opens at http://localhost:3000
```

### Build for Production
```bash
npm run build
# Output in dist/
```

### Preview Production Build
```bash
npm run preview
```

### Linting
```bash
npm run lint
```

### Formatting
```bash
npm run format
```

## Migrating Remaining Animations

To convert a vanilla JS animation to React:

1. Create a new file in `src/animations/YourAnimation.tsx`
2. Import necessary hooks and types:
   ```typescript
   import { useApp } from '@/contexts/AppContext';
   import { useAnimation } from '@/hooks/useAnimation';
   import { AnimationBase } from '@types';
   ```
3. Extract the animation logic into the `onStart` callback
4. Return an `AnimationBase` object with `start`, `stop`, and optional `cleanup` methods
5. Add the component to `App.tsx`
6. Add a button in the appropriate sidebar to toggle it

### Example Migration

**Before (vanilla JS):**
```javascript
// In animations/my-animation.js
const canvas = document.getElementById('my-canvas');
const ctx = canvas.getContext('2d');

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // ... animation logic
  requestAnimationFrame(animate);
}

document.getElementById('my-btn').addEventListener('click', () => {
  animate();
});
```

**After (React + TypeScript):**
```typescript
// In src/animations/MyAnimation.tsx
import { useAnimation } from '@/hooks/useAnimation';
import { AnimationBase } from '@types';

const MyAnimation = () => {
  useAnimation({
    name: 'my-animation',
    onStart: () => {
      const canvas = document.getElementById('my-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return null;

      let frameId: number;
      let isRunning = true;

      const animate = () => {
        if (!isRunning) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // ... animation logic
        frameId = requestAnimationFrame(animate);
      };

      return {
        name: 'my-animation',
        isActive: true,
        start: () => {
          canvas.style.display = 'block';
          animate();
        },
        stop: () => {
          isRunning = false;
          cancelAnimationFrame(frameId);
          canvas.style.display = 'none';
        },
      };
    },
  });

  return null;
};

export default MyAnimation;
```

## Benefits of the New Architecture

1. **Type Safety**: Catch errors at compile time, not runtime
2. **Modularity**: Each component is independent and testable
3. **Performance**: Vite's HMR speeds up development significantly
4. **Maintainability**: Clear structure makes onboarding easier
5. **Scalability**: Easy to add new features without global conflicts
6. **Developer Experience**: Modern tooling (TypeScript, ESLint, Prettier)

## Next Steps

1. ✅ Core infrastructure set up
2. ⏳ Migrate remaining 12 animations to React components
3. ⏳ Convert controller.html to React
4. ⏳ Add tests for critical components
5. ⏳ Update main README with new instructions

## Compatibility

The legacy vanilla JS application is preserved in the `legacy/` folder. If needed, you can revert by:

1. Copying files from `legacy/` back to root
2. Removing the `src/` directory
3. Restoring old `index.html`

However, going forward, all new development should use the React + TypeScript architecture.
