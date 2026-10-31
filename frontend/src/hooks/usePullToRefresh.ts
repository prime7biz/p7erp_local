import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type Options = {
  onRefresh: () => void | Promise<void>;
  /** Min pull distance in px before refresh triggers */
  threshold?: number;
  disabled?: boolean;
};

/**
 * Simple mobile pull-to-refresh for scrollable pages.
 */
export function usePullToRefresh({ onRefresh, threshold = 72, disabled }: Options) {
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const runRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    if (disabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 2 || refreshing) return;
      startY.current = e.touches[0]?.clientY ?? 0;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = Math.max(0, y - startY.current);
      if (delta > 0 && window.scrollY <= 0) {
        setPullDistance(Math.min(delta * 0.45, threshold * 1.4));
      }
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;
      setPullDistance((d) => {
        if (d >= threshold) {
          void runRefresh();
          return d;
        }
        return 0;
      });
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [disabled, refreshing, runRefresh, threshold]);

  return {
    pullDistance,
    refreshing,
    indicatorStyle: {
      height: pullDistance || (refreshing ? 36 : 0),
      opacity: pullDistance > 8 || refreshing ? 1 : 0,
    } as CSSProperties,
  };
}
