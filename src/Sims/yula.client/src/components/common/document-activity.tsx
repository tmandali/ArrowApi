import * as React from "react"
import { Label } from "@/components/ui/label"
import {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "@/components/ui/timeline"
import { MessageSquare } from "lucide-react"
import { cn } from "@/utils/cn"

export type ActivityItem = {
  id: string
  type?: "event" | "comment"
  author: string
  message: string
  time: string
  commentText?: string
}

type DocumentActivityProps = {
  items?: ActivityItem[]
  className?: string
  /** Yorum satırındaki Vazgeç butonu (kayıt bazında silme) */
  onDismissComment?: (id: string) => void
}

const defaultItems: ActivityItem[] = [
  {
    id: "1",
    type: "event",
    author: "You",
    message: "last edited this",
    time: "4 hours ago",
  },
  {
    id: "2",
    type: "comment",
    author: "You",
    message: "commented",
    time: "4 hours ago",
    commentText: "ok",
  },
  {
    id: "3",
    type: "event",
    author: "Pushkar Joshi",
    message: "created this",
    time: "3 years ago",
  },
]

export function DocumentActivity({
  items = defaultItems,
  className,
  onDismissComment,
}: DocumentActivityProps) {
  const [showAllActivity, setShowAllActivity] = React.useState(false)

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Activity</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={showAllActivity}
              id="show-all-activity"
              data-state={showAllActivity ? "checked" : "unchecked"}
              onClick={() => setShowAllActivity((prev) => !prev)}
              className="peer inline-flex h-[1.15rem] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80"
            >
              <span
                data-state={showAllActivity ? "checked" : "unchecked"}
                className="bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
              />
            </button>
            <Label
              htmlFor="show-all-activity"
              className="text-xs cursor-pointer text-muted-foreground"
            >
              Show all activity
            </Label>
          </div>
        </div>
      </div>

      <Timeline>
        {items.map((item) => {
          if (item.type === "comment") {
            return (
              <TimelineItem key={item.id}>
                <span className="absolute -left-[30px] top-0 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground ring-4 ring-background">
                  <MessageSquare className="size-2.5" />
                </span>
                <TimelineContent className="w-full gap-2">
                  <TimelineTitle>
                    <span className="font-medium">{item.author}</span>{" "}
                    {item.message} · <TimelineTime>{item.time}</TimelineTime>
                  </TimelineTitle>
                  {item.commentText ? (
                    <div className="rounded-md border bg-card p-3 text-xs space-y-2">
                      <p>{item.commentText}</p>
                      <div className="flex items-center gap-3 text-[11px]">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            onDismissComment?.(item.id)
                          }
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ) : null}
                </TimelineContent>
              </TimelineItem>
            )
          }

          return (
            <TimelineItem key={item.id}>
              <TimelineDot />
              <TimelineContent>
                <TimelineTitle>
                  <span className="font-medium">{item.author}</span>{" "}
                  {item.message} · <TimelineTime>{item.time}</TimelineTime>
                </TimelineTitle>
              </TimelineContent>
            </TimelineItem>
          )
        })}
      </Timeline>

      {showAllActivity ? (
        <p className="text-[11px] text-muted-foreground pl-6">
          Showing all activity events.
        </p>
      ) : null}
    </div>
  )
}
