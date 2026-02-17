import { useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { AnimationBase } from '@types';

interface UseAnimationProps {
  name: string;
  onStart: () => AnimationBase | null;
}

export const useAnimation = ({ name, onStart }: UseAnimationProps) => {
  const { activeAnimations } = useApp();
  const animationRef = useRef<AnimationBase | null>(null);

  useEffect(() => {
    const isActive = activeAnimations.has(name);

    if (isActive && !animationRef.current) {
      // Start animation
      try {
        const animation = onStart();
        if (animation) {
          animationRef.current = animation;
          animation.start();
        }
      } catch (error) {
        console.error(`Error starting animation ${name}:`, error);
      }
    } else if (!isActive && animationRef.current) {
      // Stop animation
      try {
        animationRef.current.stop();
        if (animationRef.current.cleanup) {
          animationRef.current.cleanup();
        }
      } catch (error) {
        console.error(`Error stopping animation ${name}:`, error);
      } finally {
        animationRef.current = null;
      }
    }

    return () => {
      if (animationRef.current) {
        try {
          animationRef.current.stop();
          if (animationRef.current.cleanup) {
            animationRef.current.cleanup();
          }
        } catch (error) {
          console.error(`Error cleaning up animation ${name}:`, error);
        }
      }
    };
  }, [activeAnimations, name, onStart]);

  return animationRef;
};
