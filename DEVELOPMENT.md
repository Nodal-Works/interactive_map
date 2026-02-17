# Development Guide

## Getting Started

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm 9+ or yarn 1.22+
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/Nodal-Works/interactive_map.git
cd interactive_map

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will open at `http://localhost:3000`.

## Available Scripts

### Development
```bash
npm run dev          # Start dev server with HMR
npm run build        # Build for production
npm run preview      # Preview production build
```

### Code Quality
```bash
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
```

## Project Structure

```
interactive_map/
├── src/                          # Source code
│   ├── animations/               # Animation components
│   │   └── GridAnimation.tsx    # Example animation
│   ├── components/               # UI components
│   │   ├── Map.tsx              # MapLibre GL wrapper
│   │   ├── LeftSidebar.tsx      # Left sidebar controls
│   │   ├── RightSidebar.tsx     # Right sidebar controls
│   │   └── StartOverlay.tsx     # Audio context overlay
│   ├── contexts/                 # React contexts
│   │   └── AppContext.tsx       # Global app state
│   ├── hooks/                    # Custom hooks
│   │   └── useAnimation.ts      # Animation lifecycle
│   ├── types/                    # TypeScript types
│   │   └── index.ts             # Type definitions
│   ├── utils/                    # Utilities
│   │   ├── EventBus.ts          # Event system
│   │   └── helpers.ts           # Helper functions
│   ├── App.tsx                   # Main app component
│   ├── App.css                   # Global styles
│   └── main.tsx                  # Entry point
├── public/                       # Static assets
│   ├── media/                    # Images, videos, etc.
│   └── map-calibration.json     # Map settings
├── legacy/                       # Original vanilla JS
│   ├── animations/              # Old animations
│   ├── main.js                  # Old main file
│   └── controller.js            # Old controller
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts               # Vite config
└── index.html                    # HTML entry point
```

## Adding a New Animation

### 1. Create Component File

Create `src/animations/MyAnimation.tsx`:

```typescript
import { useAnimation } from '@/hooks/useAnimation';
import { AnimationBase } from '@types';
import { useApp } from '@/contexts/AppContext';

const MyAnimation = () => {
  const { map } = useApp();

  useAnimation({
    name: 'my-animation',
    onStart: () => {
      if (!map) return null;

      // Get canvas or create elements
      const canvas = document.getElementById('my-canvas') as HTMLCanvasElement;
      if (!canvas) return null;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Animation state
      let frameId: number;
      let isRunning = true;

      // Animation loop
      const animate = () => {
        if (!isRunning) return;
        
        // Your animation logic here
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // ... draw stuff
        
        frameId = requestAnimationFrame(animate);
      };

      // Return animation object
      const animation: AnimationBase = {
        name: 'my-animation',
        isActive: true,
        start: () => {
          canvas.style.display = 'block';
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          animate();
        },
        stop: () => {
          isRunning = false;
          if (frameId) cancelAnimationFrame(frameId);
          canvas.style.display = 'none';
        },
        cleanup: () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        },
      };

      return animation;
    },
  });

  return null;
};

export default MyAnimation;
```

### 2. Add Canvas to App

In `src/App.tsx`:

```tsx
<canvas id="my-canvas" style={{ display: 'none' }} />
```

### 3. Import Component

In `src/App.tsx`:

```tsx
import MyAnimation from './animations/MyAnimation';

// In the component:
<MyAnimation />
```

### 4. Add Toggle Button

In `src/components/LeftSidebar.tsx` or `RightSidebar.tsx`:

```tsx
<IconButton title="My Animation" onClick={() => toggleAnimation('my-animation')}>
  <svg>...</svg>
</IconButton>
```

## Working with State

### Global State (AppContext)

```tsx
import { useApp } from '@/contexts/AppContext';

const MyComponent = () => {
  const { 
    map,              // MapLibre GL instance
    calibration,      // Map calibration settings
    currentBasemap,   // Active basemap
    setBasemap,       // Change basemap
    activeAnimations, // Set of active animation names
    toggleAnimation   // Toggle animation on/off
  } = useApp();
  
  // Use state...
};
```

### Event System (EventBus)

```tsx
import { eventBus } from '@/utils/EventBus';

// Emit event
eventBus.emit('animation:start', { name: 'my-animation', data: {...} });

// Listen for event
useEffect(() => {
  const unsubscribe = eventBus.on('animation:start', (message) => {
    console.log('Animation started:', message.payload);
  });
  
  return unsubscribe; // Cleanup on unmount
}, []);
```

## TypeScript Tips

### Type Definitions

All types are in `src/types/index.ts`:

```typescript
import { AnimationBase, MapCalibration, AppContextType } from '@types';
```

### Adding New Types

```typescript
// In src/types/index.ts
export interface MyNewType {
  id: string;
  name: string;
  data: number[];
}
```

### Type-Safe Props

```typescript
interface MyComponentProps {
  title: string;
  count: number;
  onUpdate: (value: number) => void;
}

const MyComponent = ({ title, count, onUpdate }: MyComponentProps) => {
  // Component logic
};
```

## Styling

### Global Styles
Edit `src/App.css` for global styles.

### Component-Specific Styles
- Use inline styles for simple cases
- Add classes to App.css for complex styles
- Consider CSS modules for large components

## Debugging

### React DevTools
Install React DevTools browser extension for:
- Component tree inspection
- Props and state inspection
- Performance profiling

### TypeScript Errors
- Check VSCode for inline errors
- Run `npm run build` to see all errors
- Use TypeScript playground for complex types

### Console Logging
```typescript
console.log('Debug:', value);
console.error('Error:', error);
console.warn('Warning:', warning);
```

## Performance

### Optimization Tips
1. Use `React.memo()` for expensive components
2. Use `useMemo()` for expensive calculations
3. Use `useCallback()` for event handlers
4. Lazy load animations with dynamic imports

### Bundle Size
- Check bundle size: `npm run build`
- Analyze bundle: Add `--analyze` flag in vite config
- Use dynamic imports for large dependencies

## Testing

### Unit Tests (Future)
```bash
# To be implemented
npm run test
```

### Manual Testing Checklist
- [ ] Map loads correctly
- [ ] Basemap switching works
- [ ] Sidebar buttons toggle animations
- [ ] Animations start/stop properly
- [ ] No console errors
- [ ] Responsive design works

## Deployment

### Production Build
```bash
npm run build
```

Output in `dist/` folder.

### Preview Production Build
```bash
npm run preview
```

### Deploy to Server
1. Build the app: `npm run build`
2. Upload `dist/` folder to server
3. Configure server to serve `index.html` for all routes
4. Ensure HTTPS is enabled
5. Set proper CORS headers if needed

## Common Issues

### Map Not Loading
- Check calibration file exists: `public/map-calibration.json`
- Verify MapLibre GL CSS is imported
- Check browser console for errors

### Animation Not Starting
- Verify canvas element exists
- Check animation name matches in toggle button
- Ensure `useAnimation` hook is called correctly

### Build Errors
- Clear node_modules: `rm -rf node_modules && npm install`
- Check TypeScript errors: `npm run build`
- Verify all imports are correct

### Hot Reload Not Working
- Restart dev server: `npm run dev`
- Check file is in `src/` directory
- Verify file extension is `.tsx` or `.ts`

## Resources

- [React Docs](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)
- [MapLibre GL JS](https://maplibre.org/)
- [Three.js Docs](https://threejs.org/docs/)

## Getting Help

1. Check existing documentation
2. Search GitHub issues
3. Create new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
