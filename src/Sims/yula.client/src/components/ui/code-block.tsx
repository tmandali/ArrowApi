import * as React from "react"
import { createHighlighter, type Highlighter } from "shiki"
import { useTheme } from "@/context/theme-provider"
import { cn } from "@/utils/cn"

type CodeBlockProps = {
  value: string
  language?: string
  className?: string
  darkMode?: boolean
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
}: CodeBlockProps) {
  const { resolvedTheme } = useTheme()
  const isDark = darkMode ?? resolvedTheme === "dark"
  const theme = isDark ? "dark-plus" : "light-plus"
  const [html, setHtml] = React.useState("")

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
        "code-block relative min-h-0 max-h-72 w-full overflow-auto rounded-md border border-input text-xs",
        className
      )}
    >
      {html ? (
        <div
          className="min-h-full [&_pre]:m-0 [&_pre]:min-h-full [&_pre]:overflow-visible [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:leading-relaxed [&_code]:font-mono"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="m-0 min-h-full bg-muted/30 p-3 font-mono text-[12px] leading-relaxed text-muted-foreground">
          {value}
        </pre>
      )}
    </div>
  )
}
