import * as React from "react"
import { ImageIcon, Upload, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"

type ItemImageUploadProps = {
  className?: string
}

export function ItemImageUpload({ className }: ItemImageUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(
    "/images/iphone.png"
  )
  const [fileName, setFileName] = React.useState<string | null>("iphone.png")
  const [isDragging, setIsDragging] = React.useState(false)

  React.useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const applyFile = React.useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith("image/")) {
        return
      }

      setPreviewUrl((prev) => {
        if (prev && prev.startsWith("blob:")) {
          URL.revokeObjectURL(prev)
        }
        return URL.createObjectURL(file)
      })
      setFileName(file.name)
    },
    []
  )

  const clearImage = React.useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev)
      }
      return null
    })
    setFileName(null)
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }, [])

  const openPicker = () => inputRef.current?.click()

  return (
    <div className={cn("space-y-1.5", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => applyFile(event.target.files?.[0])}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            openPicker()
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          setIsDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          applyFile(event.dataTransfer.files?.[0])
        }}
        className={cn(
          "group relative aspect-square w-full overflow-hidden rounded-lg border bg-background outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring/40",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-muted-foreground/40"
        )}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={fileName ?? "Item image"}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="size-8 opacity-60" />
            <span className="text-[11px]">No image</span>
          </div>
        )}

        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white transition-opacity",
            isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <Upload className="size-5" />
          <span className="text-xs font-medium">
            {previewUrl ? "Change image" : "Upload image"}
          </span>
          <span className="text-[10px] text-white/80">or drag & drop</span>
        </div>
      </div>

      {previewUrl ? (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <p className="truncate text-[11px] text-muted-foreground" title={fileName ?? undefined}>
            {fileName}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation()
              clearImage()
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
