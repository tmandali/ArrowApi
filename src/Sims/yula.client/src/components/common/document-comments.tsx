import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"

type DocumentCommentsProps = {
  initials?: string
  placeholder?: string
}

export function DocumentComments({
  initials = "JD",
  placeholder = "Type a reply / comment",
}: DocumentCommentsProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Comments</h3>
      <div className="flex items-center gap-3">
        <Avatar className="size-8">
          <AvatarFallback className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <Input
          placeholder={placeholder}
          className="bg-muted/20 border-muted-foreground/20 h-9 text-xs flex-1"
        />
      </div>
    </div>
  )
}
