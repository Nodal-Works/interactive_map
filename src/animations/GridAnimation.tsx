import { useApp } from '@/contexts/AppContext';
import { useAnimation } from '@/hooks/useAnimation';
import { AnimationBase } from '@types';

const GridAnimation = () => {
  const { map } = useApp();

  useAnimation({
    name: 'grid-animation',
    onStart: () => {
      if (!map) return null;

      const canvas = document.getElementById('grid-animation-canvas') as HTMLCanvasElement;
      if (!canvas) {
        console.warn('Grid animation canvas not found');
        return null;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      let animationFrameId: number;
      let isRunning = true;

      const animate = () => {
        if (!isRunning) return;

        // Grid animation logic would go here
        // For now, just a placeholder
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        animationFrameId = requestAnimationFrame(animate);
      };

      const animation: AnimationBase = {
        name: 'grid-animation',
        isActive: true,
        start: () => {
          canvas.style.display = 'block';
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          animate();
        },
        stop: () => {
          isRunning = false;
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
          }
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

export default GridAnimation;
