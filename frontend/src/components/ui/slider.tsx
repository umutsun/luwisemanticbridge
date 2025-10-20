"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    variant?: 'default' | 'success' | 'warning' | 'error';
    size?: 'sm' | 'md' | 'lg';
  }
>(({ className, variant = 'default', size = 'md', ...props }, ref) => {
  const trackStyles = {
    default: "bg-secondary/30",
    success: "bg-green-100 dark:bg-green-950/30",
    warning: "bg-yellow-100 dark:bg-yellow-950/30",
    error: "bg-red-100 dark:bg-red-950/30"
  };

  const rangeStyles = {
    default: "bg-primary",
    success: "bg-green-500",
    warning: "bg-yellow-500",
    error: "bg-red-500"
  };

  const sizeStyles = {
    sm: { track: "h-1", thumb: "h-3 w-3" },
    md: { track: "h-1.5", thumb: "h-4 w-4" },
    lg: { track: "h-2", thumb: "h-5 w-5" }
  };

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative w-full grow overflow-hidden rounded-full backdrop-blur-sm transition-colors",
          trackStyles[variant],
          sizeStyles[size].track
        )}
      >
        <SliderPrimitive.Range
          className={cn(
            "absolute h-full transition-all duration-200 ease-out rounded-full",
            rangeStyles[variant]
          )}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          "block rounded-full bg-background border shadow-lg transition-all duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          "border-primary/20 hover:border-primary/40",
          sizeStyles[size].thumb
        )}
      />
    </SliderPrimitive.Root>
  );
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
