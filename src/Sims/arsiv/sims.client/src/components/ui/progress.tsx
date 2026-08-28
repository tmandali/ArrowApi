import * as React from "react"
import { cn } from "@/utils/cn"

export type ProgressProps = React.ComponentProps<"div"> & {
  value?: number | null
}

function Progress({ className, value = 0, ...props }: ProgressProps) {
  const isIndeterminate = value == null

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isIndeterminate ? undefined : value ?? 0}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn(
          "h-full bg-primary transition-all duration-300 ease-in-out",
          isIndeterminate
            ? "w-1/3 animate-[progress-indeterminate_1.5s_infinite_linear] rounded-full"
            : "w-full flex-1"
        )}
        style={
          isIndeterminate
            ? undefined
            : { transform: `translateX(-${100 - (value ?? 0)}%)` }
        }
      />
    </div>
  )
}

export { Progress }
