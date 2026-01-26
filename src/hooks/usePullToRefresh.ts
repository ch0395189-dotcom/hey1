import { useState, useRef, useCallback, TouchEvent } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number; // pixels to pull before triggering refresh
  maxPull?: number; // maximum pull distance
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
  handlers: {
    onTouchStart: (e: TouchEvent) => void;
    onTouchMove: (e: TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
  maxPull = 120,
}: UsePullToRefreshOptions): UsePullToRefreshReturn => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  
  const startY = useRef(0);
  const currentY = useRef(0);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshing) return;
    
    const touch = e.touches[0];
    startY.current = touch.clientY;
    currentY.current = touch.clientY;
  }, [isRefreshing]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (isRefreshing) return;
    
    const touch = e.touches[0];
    currentY.current = touch.clientY;
    
    const diff = currentY.current - startY.current;
    
    // Only trigger if pulling down and at the top of the scroll container
    if (diff > 0) {
      const target = e.currentTarget as HTMLElement;
      const scrollTop = target.scrollTop || 0;
      
      if (scrollTop <= 0) {
        setIsPulling(true);
        // Apply resistance - the further you pull, the harder it gets
        const resistance = 0.5;
        const adjustedDiff = Math.min(diff * resistance, maxPull);
        setPullDistance(adjustedDiff);
      }
    }
  }, [isRefreshing, maxPull]);

  const onTouchEnd = useCallback(async () => {
    if (isRefreshing) return;
    
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold / 2); // Keep a small pull distance during refresh
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    
    setPullDistance(0);
    setIsPulling(false);
    startY.current = 0;
    currentY.current = 0;
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  return {
    pullDistance,
    isRefreshing,
    isPulling,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
};
