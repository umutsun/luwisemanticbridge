import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    // Always use uncontrolled mode with defaultValue to avoid React warnings
    // This is the simplest solution to prevent the controlled component warning
    const { value, defaultValue, onChange, ...rest } = props;

    const normalizedProps: React.InputHTMLAttributes<HTMLInputElement> = {
      type,
      className: cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      ),
      ref: ref as any,
      ...rest,
    }

    // If value is provided with onChange, use controlled mode
    if (value !== undefined && onChange !== undefined) {
      normalizedProps.value = value
      normalizedProps.onChange = onChange
    }
    // If defaultValue is provided, use uncontrolled mode
    else if (defaultValue !== undefined) {
      normalizedProps.defaultValue = defaultValue
    }
    // If value is provided without onChange, make it read-only
    else if (value !== undefined) {
      normalizedProps.defaultValue = value
      normalizedProps.readOnly = true
    }
    // Default case - empty uncontrolled input
    else {
      normalizedProps.defaultValue = ""
    }

    return <input {...normalizedProps} />
  }
)
Input.displayName = "Input"

export { Input }
