import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium transition-all duration-200 backdrop-blur-sm border",
  {
    variants: {
      variant: {
        default:
          "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20",
        secondary:
          "bg-secondary/50 text-secondary-foreground border-secondary/30 hover:bg-secondary/70",
        success:
          "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800/50 hover:bg-green-100 dark:hover:bg-green-950/50",
        warning:
          "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-800/50 hover:bg-yellow-100 dark:hover:bg-yellow-950/50",
        error:
          "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-950/50",
        info:
          "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-950/50",
        outline:
          "bg-background text-foreground border-border hover:bg-muted/50",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px]",
        md: "px-2 py-1 text-xs",
        lg: "px-3 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

export { Badge, badgeVariants }