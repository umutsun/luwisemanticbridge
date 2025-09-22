import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground border-border",
        success:
          "border-transparent bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:text-white dark:hover:bg-green-700",
        warning:
          "border-transparent bg-yellow-400 text-gray-900 hover:bg-yellow-500 dark:bg-yellow-500 dark:text-gray-900 dark:hover:bg-yellow-600",
        info:
          "border-transparent bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700",
        pink:
          "border-transparent bg-pink-500 text-white hover:bg-pink-600 dark:bg-pink-600 dark:text-white dark:hover:bg-pink-700",
        purple:
          "border-transparent bg-purple-500 text-white hover:bg-purple-600 dark:bg-purple-600 dark:text-white dark:hover:bg-purple-700",
        gray:
          "border-transparent bg-gray-500 text-white hover:bg-gray-600 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-700",
      },
      shape: {
        default: "rounded-full",
        square: "rounded-none",
        rounded: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      shape: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, shape, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, shape }), className)} {...props} />
  )
}

export { Badge, badgeVariants }