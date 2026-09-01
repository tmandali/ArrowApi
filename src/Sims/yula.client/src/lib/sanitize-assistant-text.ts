/**
 * Asistan metnindeki sızan araç/kanal tokenları ve yazı sistemi çöpünü temizler.
 * Boşluk/satır başı-sonu kırpılmaz (akışta kelimeler yapışır).
 */

/** ASCII + Latin (Türkçe şğıüöç dahil) + sık tırnak/tire. Diğer yazı sistemleri elenir. */
const NON_UI_CHAR =
  /[^\t\n\r\u0020-\u007E\u00A0-\u024F\u1E00-\u1EFF\u2010-\u201F\u2026]/g

const SPECIAL_TOKEN = /<\|[^|>]{0,80}\|>/g

const LEAK_MARK =
  /to=functions|functions\.set_grid_query|【|】|<\|vq_|tool call malformed|no such tool|ADDITIONAL_ARGS|content=\{\s*\}|EIFjson|need valid tool call/i

const TOOL_PHRASE =
  /to=functions\.\S*|functions\.\w+|\{[^{}]{0,160}json\s*to=functions\S*|ADDITIONAL_ARGS_DO_NOT_PARSE\S*|content\s*=\s*\{[^}]*\}|tool call malformed[^\n]*|function syntax invalid[^\n]*|error\?\s*no such tool\??|need valid tool call[^\n]*|Let's do proper JSON[^\n]*|json likely invalid[^\n]*|not possible\./gi

export function stripLeakedControlTokens(text: string): string {
  if (!text) return ""
  if (/^\s+$/.test(text)) return text

  return text
    .replace(SPECIAL_TOKEN, "")
    .replace(/【[^】]{0,4000}】/g, "")
    .replace(/[【】]/g, "")
    .replace(TOOL_PHRASE, "")
    .replace(NON_UI_CHAR, "")
}

export function sanitizeAssistantText(text: string): string {
  if (!text) return ""

  const leaked = LEAK_MARK.test(text)
  let s = stripLeakedControlTokens(text)
  s = s
    .split("\n")
    .filter((line) => !isJunkLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")

  if (!s) return ""
  if (leaked && (isDebugSoup(s) || letterCount(s) < 24)) return ""
  if (isMostlyJunk(s) || isDebugSoup(s)) return ""
  return s
}

function isJunkLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (LEAK_MARK.test(t)) return true
  if (isDebugSoup(t)) return true
  return false
}

function isDebugSoup(s: string): boolean {
  return /malformed|no such tool|not possible\.|valid tool call|json content|by mistake\?/i.test(
    s,
  )
}

function letterCount(s: string): number {
  return (s.match(/[A-Za-zÀ-ɏ\u011E\u011F\u0130\u0131\u015E\u015F]/g) ?? []).length
}

function isMostlyJunk(s: string): boolean {
  const compact = s.replace(/\s/g, "")
  if (compact.length < 8) return false
  const letters = compact.replace(/[^\p{L}\p{N}]/gu, "")
  if (letters.length < 4) return true
  return letters.length / compact.length < 0.25
}
