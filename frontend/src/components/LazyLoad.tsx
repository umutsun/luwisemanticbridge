'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface LazyLoadProps {
  children: React.ReactNode;
  height?: string;
  placeholder?: React.ReactNode;
  offset?: number;
  className?: string;
}

export default function LazyLoad({
  children,
  height = '400px',
  placeholder,
  offset = 100,
  className = ''
}: LazyLoadProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: `${offset}px`
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [offset]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      style={{ height: isVisible ? 'auto' : height }}
    >
      {!isVisible && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
          {placeholder || <Loader2 className="h-8 w-8 animate-spin" />}
        </div>
      )}

      {isVisible && (
        <div className={isLoading ? 'invisible' : 'visible'}>
          {React.cloneElement(children as React.ReactElement, {
            onLoad: handleLoad,
            onError: handleLoad
          })}
        </div>
      )}
    </div>
  );
}