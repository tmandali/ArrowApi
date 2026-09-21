import * as React from "react"
import { MoreHorizontal } from "lucide-react"
import { InputGroupButton } from "@/components/ui/input-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/utils/cn"
import type { CriteriaLookupField } from "../types"

export interface DisplayFieldsMenuProps {
  displayFields: CriteriaLookupField[]
  selectedDisplayFields: string[]
  onSelectedDisplayFieldsChange: (fieldKey: string) => void
}

export function DisplayFieldsMenu({
  displayFields,
  selectedDisplayFields,
  onSelectedDisplayFieldsChange,
}: DisplayFieldsMenuProps) {
  if (displayFields.length <= 1) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <InputGroupButton
          variant="ghost"
          size="icon-xs"
          aria-label="Display fields"
          className="text-muted-foreground hover:text-foreground"
          onMouseDown={(event) => event.preventDefault()}
        >
          <MoreHorizontal />
        </InputGroupButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        alignOffset={-4}
        className="min-w-40"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Display fields</DropdownMenuLabel>
          {displayFields.map((field) => {
            const selected = selectedDisplayFields.includes(field.key)
            return (
              <DropdownMenuItem
                key={field.key}
                className={cn(selected && "bg-accent")}
                onClick={() => onSelectedDisplayFieldsChange(field.key)}
              >
                {field.title}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
