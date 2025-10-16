import { useState, useEffect, useMemo } from 'react';

interface VirtualizationOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

interface VirtualizationResult<T> {
  visibleItems: T[];
  totalHeight: number;
  scrollTop: number;
  containerProps: {
    style: {
      height: number;
      overflow: 'auto';
    };
    onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  };
  contentProps: {
    style: {
      height: number;
      position: 'relative';
    };
  };
  itemProps: (index: number) => {
    style: {
      position: 'absolute';
      top: number;
      left: 0;
      right: 0;
      height: number;
    };
  };
}

export function useVirtualization<T>(
  items: T[],
  options: VirtualizationOptions
): VirtualizationResult<T> {
  const { itemHeight, containerHeight, overscan = 5 } = options;
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, overscan, items.length]);

  const visibleItems = useMemo(
    () => items.slice(visibleRange.startIndex, visibleRange.endIndex + 1),
    [items, visibleRange]
  );

  const totalHeight = items.length * itemHeight;

  const containerProps = {
    style: {
      height: containerHeight,
      overflow: 'auto' as const,
    },
    onScroll: (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    },
  };

  const contentProps = {
    style: {
      height: totalHeight,
      position: 'relative' as const,
    },
  };

  const itemProps = (index: number) => ({
    style: {
      position: 'absolute' as const,
      top: index * itemHeight,
      left: 0,
      right: 0,
      height: itemHeight,
    },
  });

  return {
    visibleItems,
    totalHeight,
    scrollTop,
    containerProps,
    contentProps,
    itemProps,
  };
}