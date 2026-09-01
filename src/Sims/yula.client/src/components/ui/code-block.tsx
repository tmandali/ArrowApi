import * as React from "react"
import { Check, Copy } from "lucide-react"
import { createHighlighter, type Highlighter } from "shiki"
import { useTheme } from "@/context/theme-provider"
import { cn } from "@/utils/cn"
import { copyToClipboard } from "@/lib/clipboard"

type CodeBlockProps = {
  value: string
  language?: string
  className?: string
  darkMode?: boolean
  showCopyButton?: boolean
}

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["dark-plus", "light-plus"],
      langs: ["json", "sql", "xml", "bash", "typescript", "javascript", "html", "css"],
    })
  }
  return highlighterPromise
}

export function CodeBlock({
  value,
  language = "json",
  className,
  darkMode,
  showCopyButton = true,
}: CodeBlockProps) {
  const { resolvedTheme } = useTheme()
  const isDark = darkMode ?? resolvedTheme === "dark"
  const theme = isDark ? "dark-plus" : "light-plus"
  const [html, setHtml] = React.useState("")
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!value) return
      const success = await copyToClipboard(value)
      if (success) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    },
    [value]
  )

  React.useEffect(() => {
    let cancelled = false
    void getHighlighter()
      .then((highlighter) => {
        if (cancelled) return
        setHtml(
          highlighter.codeToHtml(value || " ", {
            lang: language,
            theme,
          })
        )
      })
      .catch(() => {
        if (!cancelled) setHtml("")
      })
    return () => {
      cancelled = true
    }
  }, [value, language, theme])

  return (
    <div
      className={cn(
        "code-block group/codeblock relative min-h-0 max-h-72 w-full overflow-auto rounded-md border border-input text-xs select-text",
        className
      )}
    >
      {showCopyButton ? (
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? "Kopyalandı" : "Kodu / JSON'ı Kopyala"}
          className="absolute top-1.5 right-1.5 z-10 inline-flex items-center justify-center p-1 rounded-md border-0 bg-transparent text-muted-foreground/70 opacity-0 transition-all hover:bg-muted/40 hover:text-foreground group-hover/codeblock:opacity-100 cursor-pointer backdrop-blur-xs"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      ) : null}

      {html ? (
        <div
          className="min-h-full [&_pre]:m-0 [&_pre]:min-h-full [&_pre]:overflow-visible [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[11.5px] [&_pre]:leading-relaxed [&_code]:font-mono"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="m-0 min-h-full bg-muted/30 p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
          {value}
        </pre>
      )}
    </div>
  )
}
