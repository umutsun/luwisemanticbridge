import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    variant?: 'default' | 'success' | 'warning' | 'error' | 'gradient' | 'rainbow';
    size?: 'sm' | 'md' | 'lg';
    animated?: boolean;
  }
>(({ className, value, variant = 'default', size = 'md', animated = false, ...props }, ref) => {
  const variantStyles = {
    default: "bg-primary",
    success: "bg-gradient-to-r from-green-400 to-emerald-500",
    warning: "bg-gradient-to-r from-yellow-400 to-orange-500",
    error: "bg-gradient-to-r from-red-400 to-rose-500",
    gradient: "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500",
    rainbow: "bg-gradient-to-r from-blue-500 via-purple-500 via-pink-500 via-orange-400 to-yellow-400"
  };

  const sizeStyles = {
    sm: "h-1.5",
    md: "h-2",
    lg: "h-3"
  };

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-secondary/30 backdrop-blur-sm",
        sizeStyles[size],
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 transition-all duration-500 ease-out rounded-full relative overflow-hidden",
          variantStyles[variant],
          variant !== 'default' && "shadow-sm"
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      >
        {/* Animated shimmer effect for gradient variants */}
        {animated && (variant === 'gradient' || variant === 'rainbow') && (
          <div className="absolute inset-0 -skew-x-12">
            <div className="w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        )}
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  );
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }