import { useCallback } from 'react';
import confetti from 'canvas-confetti';

interface ConfettiOverlayProps {
  trigger?: boolean;
  onComplete?: () => void;
}

export const fireConfetti = () => {
  const duration = 2500;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 120, zIndex: 9999, scalar: 1.12 };

  const randomInRange = (min: number, max: number) =>
    Math.random() * (max - min) + min;

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      clearInterval(interval);
      return;
    }

    const particleCount = 40 * (timeLeft / duration);

    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: -0.1 },
      colors: ['#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#0ea5e9'],
      gravity: 0.9,
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: -0.1 },
      colors: ['#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#0ea5e9'],
      gravity: 0.9,
    });
    confetti({
      ...defaults,
      particleCount: particleCount * 0.5,
      origin: { x: 0.5, y: -0.1 },
      colors: ['#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#0ea5e9'],
      gravity: 0.9,
    });
  }, 150);
};

const ConfettiOverlay = ({ trigger = false, onComplete }: ConfettiOverlayProps) => {
  const handleConfetti = useCallback(() => {
    fireConfetti();
    if (onComplete) {
      setTimeout(onComplete, 2500);
    }
  }, [onComplete]);

  if (trigger) {
    handleConfetti();
  }

  return null;
};

export default ConfettiOverlay;
