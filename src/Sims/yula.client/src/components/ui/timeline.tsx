import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/utils/cn"

const timelineVariants = cva("relative flex flex-col w-full", {
  variants: {
    orientation: {
      vertical: "space-y-6 pl-6 before:absolute before:left-[3px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border",
      horizontal: "flex-row space-x-6 pt-6 before:absolute before:top-2 before:left-2 before:right-2 before:h-0.5 before:bg-border",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
})

function Timeline({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof timelineVariants>) {
  return (
    <div
      data-slot="timeline"
      data-orientation={orientation}
      className={cn(timelineVariants({ orientation }), className)}
      {...props}
    />
  )
}

function TimelineItem({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-item"
      className={cn("relative flex items-start gap-2.5 text-xs group/timeline-item", className)}
      {...props}
    />
  )
}

const timelineDotVariants = cva(
  "absolute -left-6 top-1 size-2 rounded-full ring-4 ring-background transition-colors",
  {
    variants: {
      variant: {
        default: "bg-muted-foreground/60",
        primary: "bg-primary",
        success: "bg-emerald-500",
        destructive: "bg-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TimelineDot({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof timelineDotVariants>) {
  return (
    <span
      data-slot="timeline-dot"
      data-variant={variant}
      className={cn(timelineDotVariants({ variant }), className)}
      {...props}
    />
  )
}

function TimelineContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-content"
      className={cn("flex flex-col gap-0.5 text-foreground leading-normal", className)}
      {...props}
    />
  )
}

function TimelineTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="timeline-title"
      className={cn("font-normal text-xs text-foreground", className)}
      {...props}
    />
  )
}

function TimelineTime({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="timeline-time"
      className={cn("text-muted-foreground text-[11px]", className)}
      {...props}
    />
  )
}

export {
  Timeline,
  TimelineItem,
  TimelineDot,
  TimelineContent,
  TimelineTitle,
  TimelineTime,
}
