import * as React from "react"
import { useNavigate } from "react-router-dom"
import type { UIMessage } from "ai"
import { ArrowUpRight, Brain, ChevronDown, FileSpreadsheet, Wrench, Zap } from "lucide-react"

import { yulaCustomPartComponents } from "@/components/layout/yula-custom-parts"
import { YulaAnalyticsCard } from "@/components/layout/yula-components"
import { useAgentBridgeStore } from "@/hooks/useAgentBridge"
import { useActiveJobsStore } from "@/store/slices/active-jobs-store"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/utils/cn"

type AiChatMessageProps = {
  message: UIMessage
  /** Sohbetin en sonki asistan mesajı — düşünme bloğu canlı davranış (açık başlar, cevap bitince katlanır). */
  isLive?: boolean
  className?: string
}

const REASONING_META: Record<string, { label: string; icon: typeof Brain; iconColor: string; borderColor: string }> = {
  "tool-args": {
    label: "Araç Parametreleri",
    icon: Wrench,
    iconColor: "text-sky-500/80 dark:text-sky-400/80",
    borderColor: "border-sky-500/30 dark:border-sky-400/30",
  },
  "tool-result": {
    label: "Araç Sonucu",
    icon: Zap,
    iconColor: "text-emerald-500/80 dark:text-emerald-400/80",
    borderColor: "border-emerald-500/30 dark:border-emerald-400/30",
  },
  thinking: {
    label: "Düşünme Süreci",
    icon: Brain,
    iconColor: "text-orange-500/80 dark:text-orange-400/80",
    borderColor: "border-orange-500/30 dark:border-orange-400/30",
  },
}

function ReasoningPart({ text, isLive, meta }: { text: string; isLive?: boolean; meta?: string }) {
  const isProcessing = useAgentBridgeStore((s) => s.isProcessing)
  const [open, setOpen] = React.useState(Boolean(isLive))
  const [userToggled, setUserToggled] = React.useState(false)

  // Güncel mesajda düşünme hemen görünür; cevaplama tamamlanınca otomatik katlanır
  React.useEffect(() => {
    if (!isLive || isProcessing || userToggled) return
    const timer = setTimeout(() => setOpen(false), 1500)
    return () => clearTimeout(timer)
  }, [isLive, isProcessing, userToggled])

  if (!text.trim()) return null

  const cfg = REASONING_META[meta || "thinking"] || REASONING_META.thinking
  const Icon = cfg.icon

  return (
    <Collapsible
      open={open}
      onOpenChange={(value) => {
        setUserToggled(true)
        setOpen(value)
      }}
      className="space-y-1.5"
    >
      <CollapsibleTrigger className="group/reasoning flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
        <Icon className={cn("size-3.5 shrink-0", cfg.iconColor)} />
        {cfg.label}
        <ChevronDown className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]/reasoning:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className={cn(
            "border-l-2 pl-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground",
            cfg.borderColor
          )}
        >
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const KNOWN_SYSTEM_ACTIONS: Array<{
  pattern: RegExp
  prompt: string
  label: string
  scope?: string
}> = [
  // Stok Raporları & Modülleri
  {
    pattern: /stok bakiye(?:si|sini|ye|leri|lerinin)?(?:\s+raporu|\s+raporları|\s+raporunu)?|stock balance(?:\s+report)?/i,
    prompt: "Stok Bakiyesi hazırla",
    label: "Stok Bakiyesi",
    scope: "stock-balance",
  },
  {
    pattern: /stok analiti(?:k|ği|ğini|kleri|klerinin)?(?:\s+raporu|\s+raporları|\s+raporunu)?|stock analytics(?:\s+report)?/i,
    prompt: "Stok Analitik Raporu hazırla",
    label: "Stok Analitik Raporu",
    scope: "stock-analytics",
  },
  {
    pattern: /stok defteri(?:ni|leri|lerinin)?(?:\s+raporu|\s+raporları)?|stock ledger(?:\s+report)?/i,
    prompt: "Stok Defteri hazırla",
    label: "Stok Defteri",
    scope: "stock-ledger",
  },
  {
    pattern: /seri(?:\/|\s+ve\s+)lot izlenebilirli(?:k|ği|ğini)?(?:\s+raporu|\s+raporları)?|serial(?:\/|\s+and\s+)batch traceability(?:\s+report)?/i,
    prompt: "Seri ve Lot İzlenebilirlik Raporu hazırla",
    label: "Seri/Lot İzlenebilirlik",
    scope: "serial-batch-traceability",
  },
  {
    pattern: /stok kart(?:ı|ları|ını)?|item form/i,
    prompt: "Stok Kartı ekranını aç",
    label: "Stok Kartı",
  },
  {
    pattern: /ambar(?:lar| tanımları|ını|larını)?/i,
    prompt: "Ambarlar listesini aç",
    label: "Ambarlar",
  },
  {
    pattern: /stok girişi(?:\s+fişi|\s+fişleri)?/i,
    prompt: "Stok Girişi fişi hazırla",
    label: "Stok Girişi",
  },
  {
    pattern: /satınalma kabul(?:\s+fişi|\s+fişleri)?/i,
    prompt: "Satınalma Kabul fişlerini göster",
    label: "Satınalma Kabul",
  },
  {
    pattern: /teslimat irsaliye(?:si|leri|sini)?|delivery note/i,
    prompt: "İrsaliyeleri göster",
    label: "İrsaliyeler",
  },

  // Subcontracting (Fason)
  {
    pattern: /gelen fason sipariş(?:i|leri|lerini)?|inward subcontracting/i,
    prompt: "Gelen Fason Siparişlerini aç",
    label: "Gelen Fason Siparişleri",
  },
  {
    pattern: /giden fason sipariş(?:i|leri|lerini)?|outward subcontracting/i,
    prompt: "Giden Fason Siparişlerini aç",
    label: "Giden Fason Siparişleri",
  },
  {
    pattern: /fason teslimat(?:ı|ları|larını)?/i,
    prompt: "Fason Teslimat ekranını aç",
    label: "Fason Teslimat",
  },
  {
    pattern: /fason kabul(?:ü|leri|lerini)?/i,
    prompt: "Fason Kabul fişlerini aç",
    label: "Fason Kabul",
  },
  {
    pattern: /satış sipariş(?:i|leri|lerini)?|sales order/i,
    prompt: "Satış Siparişlerini aç",
    label: "Satış Siparişleri",
  },

  // Muhasebe & Finans
  {
    pattern: /bilanço(?:\s+tablosu|\s+raporu)?|balance sheet/i,
    prompt: "Bilanço Raporu hazırla",
    label: "Bilanço",
  },
  {
    pattern: /gelir tablosu(?:\s+raporu)?|profit and loss/i,
    prompt: "Gelir Tablosu hazırla",
    label: "Gelir Tablosu",
  },
  {
    pattern: /nakit akış(?:ı)?(?:\s+tablosu|\s+raporu)?|cash flow/i,
    prompt: "Nakit Akışı Raporu hazırla",
    label: "Nakit Akışı",
  },
  {
    pattern: /(?:genel\s+)?mizan(?:\s+raporu)?|trial balance/i,
    prompt: "Genel Mizan Raporu hazırla",
    label: "Genel Mizan",
  },
  {
    pattern: /muavin defter(?:i|ini)?|general ledger/i,
    prompt: "Muavin Defteri aç",
    label: "Muavin Defter",
  },
  {
    pattern: /(?:müşteri|satıcı)\s+defter(?:i|ini)?/i,
    prompt: "Müşteri Defterini aç",
    label: "Müşteri Defteri",
  },

  // Maliyet Dağıtımı & Üretim
  {
    pattern: /maliyet yükleme fişi|landed cost voucher/i,
    prompt: "Maliyet Yükleme Fişi oluştur",
    label: "Maliyet Yükleme Fişi",
  },
  {
    pattern: /iş emir(?:i|leri|lerini)?|work order/i,
    prompt: "İş Emirlerini göster",
    label: "İş Emirleri",
  },
  {
    pattern: /ürün reçete(?:si|leri|lerini)?|bom/i,
    prompt: "Ürün Reçetelerini aç",
    label: "Ürün Reçeteleri",
  },
  {
    pattern: /üretim planlama/i,
    prompt: "Üretim Planlama ekranını aç",
    label: "Üretim Planlama",
  },
]

function FormattedAssistantText({
  text,
  message,
}: {
  text: string
  message?: UIMessage
}) {
  const navigate = useNavigate()
  const sendPrompt = useAgentBridgeStore((s) => s.sendPrompt)

  // Mesajın tüm parçalarını (reasoning + text) ve tool verilerini birleştirerek kontrol et
  const fullContextText = React.useMemo(() => {
    const partsText =
      message?.parts
        ?.map((p: any) => (typeof p.text === "string" ? p.text : JSON.stringify(p)))
        .join("\n") || ""
    return `${partsText}\n${text}`
  }, [message, text])

  const pagePathMatch =
    fullContextText.match(/"pagePath"\s*:\s*"([^"]+)"/) ||
    fullContextText.match(/pagePath:\s*"?([^"\s\n]+)"?/)

  const fullUuidMatch =
    fullContextText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)

  const shortUuidMatch =
    fullContextText.match(/\(([0-9a-f]{8})\.\.\.\)/i) ||
    fullContextText.match(/\b([0-9a-f]{8})\b/i)

  const isExecutionConfirmation =
    fullContextText.startsWith("✓") ||
    fullContextText.startsWith("📊") ||
    fullContextText.startsWith("⚡") ||
    text.startsWith("✓") ||
    text.startsWith("📊") ||
    text.startsWith("⚡") ||
    fullContextText.includes("Report Started") ||
    fullContextText.includes("başarıyla uygulandı") ||
    fullContextText.includes("uygulandı.") ||
    fullContextText.includes("hazırlanmış güncel rapor bulundu") ||
    fullContextText.includes("Sonuç:") ||
    Boolean(pagePathMatch || fullUuidMatch)

  const navigateToReportOrJob = (reportNameOrTitle?: string) => {
    if (pagePathMatch) {
      navigate(pagePathMatch[1])
      return true
    }

    const jobs = Object.values(useActiveJobsStore.getState().jobs)
    if (fullUuidMatch) {
      const uuid = fullUuidMatch[0]
      const targetJob = jobs.find((j) => j.id.toLowerCase() === uuid.toLowerCase())
      if (targetJob?.href) {
        navigate(targetJob.href)
        return true
      }
      if (
        /stok analitik/i.test(reportNameOrTitle || "") ||
        fullContextText.toLowerCase().includes("stock-analytics") ||
        fullContextText.toLowerCase().includes("stok analitik")
      ) {
        navigate(`/stock/stock-analytics/${uuid}`)
        return true
      }
      navigate(`/stock/stock-balance/${uuid}`)
      return true
    }

    if (shortUuidMatch) {
      const shortId = shortUuidMatch[1]
      const targetJob = jobs.find((j) => j.id.toLowerCase().startsWith(shortId.toLowerCase()))
      if (targetJob?.href) {
        navigate(targetJob.href)
        return true
      }
      if (
        /stok analitik/i.test(reportNameOrTitle || "") ||
        fullContextText.toLowerCase().includes("stock-analytics") ||
        fullContextText.toLowerCase().includes("stok analitik")
      ) {
        navigate(`/stock/stock-analytics/${shortId}`)
        return true
      }
      navigate(`/stock/stock-balance/${shortId}`)
      return true
    }

    // Eğer bu bir onay/başlatma mesajıysa ve store'da güncel bir iş varsa ona git
    if (isExecutionConfirmation && jobs.length > 0) {
      const isAnalytics =
        /stok analitik/i.test(reportNameOrTitle || "") ||
        fullContextText.toLowerCase().includes("stock-analytics") ||
        fullContextText.toLowerCase().includes("stok analitik")

      const matchingJob = jobs
        .filter((j) => (isAnalytics ? /stock-analytics|analitik/i.test(j.href || j.name || j.title) : /stock-balance|bakiye/i.test(j.href || j.name || j.title)))
        .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))[0]

      if (matchingJob?.href) {
        navigate(matchingJob.href)
        return true
      }
    }

    return false
  }

  const handleActionClick = (action: (typeof KNOWN_SYSTEM_ACTIONS)[0]) => {
    // 1. Eğer bu mesaj bir işlem sonucu / onay mesajı ise, doğrudan o sayfayı aç!
    if (isExecutionConfirmation) {
      const navigated = navigateToReportOrJob(action.label)
      if (navigated) return
    }

    // 2. Normal sohbet veya genel selamlama metinlerinde ise yeni bir istek başlatır
    sendPrompt(action.prompt)
  }

  // 1. Tırnak içindeki somut öneri komutlarını tespit et (Yalnızca açık yönlendirme ve selamlama mesajlarında)
  const suggestions: Array<{ label: string; prompt: string }> = []

  if (!isExecutionConfirmation) {
    const quoteRegex = /["“'`]([^"“”'`\n]{8,85})["”'`]/g
    let match: RegExpExecArray | null

    while ((match = quoteRegex.exec(text)) !== null) {
      const candidate = match[1].trim()
      const candidateLower = candidate.toLowerCase()

      // Teknik tool isimlerini (filter_stock_balance vb.) veya çıplak rapor adlarını ("Stok Bakiyesi") hariç tut
      const isTechnicalTool = /^(filter_|update_|clear_|analyze_|detect_|get_|create_)/i.test(candidate)
      const isSimpleReportName = KNOWN_SYSTEM_ACTIONS.some(
        (a) => a.label.toLowerCase() === candidateLower || a.scope?.toLowerCase() === candidateLower
      )

      // Gerçek bir kullanıcı komut cümlesi olmalı (en az 2 kelime ve eylem/zaman içermeli)
      const isPromptSentence =
        candidate.includes(" ") &&
        (/(hazırla|hazirla|göster|goster|listele|filtrele|süz|suz|aç|ac|analiz|trend)/i.test(candidate) ||
          /^(son|bu|tüm|tum|hangi|geçen)/i.test(candidate))

      if (!isTechnicalTool && !isSimpleReportName && isPromptSentence && !suggestions.some((s) => s.prompt === candidate)) {
        suggestions.push({ label: candidate, prompt: candidate })
      }
    }
  }

  // 2. Metin içinde bilinen rapor terimlerini doğal tıklanabilir linklere dönüştür
  const renderInlineEntities = (plainText: string) => {
    // Uzun kalıpların önce eşleşmesi için desene göre sırala (greedy matching)
    const sortedActions = [...KNOWN_SYSTEM_ACTIONS].sort((a, b) => b.pattern.source.length - a.pattern.source.length)
    const allPatterns = sortedActions.map((a) => a.pattern.source).join("|")
    const entityRegex = new RegExp(`(${allPatterns})`, "gi")

    const parts = plainText.split(entityRegex)
    return parts.map((part, idx) => {
      if (!part) return null

      const matchedAction = KNOWN_SYSTEM_ACTIONS.find((a) => a.pattern.test(part))
      if (matchedAction) {
        return (
          <button
            key={idx}
            type="button"
            onClick={() => handleActionClick(matchedAction)}
            title={`${matchedAction.label} ${isExecutionConfirmation ? "sonuçlarını açmak" : "raporunu açmak"} için tıklayın`}
            className="font-semibold text-foreground hover:text-orange-600 dark:hover:text-orange-400 hover:underline cursor-pointer transition-colors inline p-0 bg-transparent border-0 text-left align-baseline"
          >
            {part}
          </button>
        )
      }

      return part
    })
  }

  // 3. Metni temiz ve zengin bileşenler halinde render et
  const renderCleanContent = (raw: string) => {
    const lines = raw.split("\n")
    return lines.map((line, lIdx) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return <div key={lIdx} className="h-1.5" />
      }

      // 3a. Onay / Çalıştırma Başlığı (örn: "✓ Stok Bakiye Raporu: ..." veya "📊 Stok Analitik Raporu Report Started: ...")
      const confirmationMatch = trimmed.match(/^([✓📊⚡]\s*)?(\*\*)?([A-Za-zÇĞİÖŞÜçğıöşü0-9\s&/()_-]{3,70}?)(?:\s+Report Started|\s+Raporu Başlatıldı|\s+Raporu Hazırlandı)?(\*\*)?\s*:\s*(.*)$/iu)
      if (confirmationMatch && (confirmationMatch[1] || isExecutionConfirmation || trimmed.includes("Report Started"))) {
        const iconPrefix = confirmationMatch[1]?.trim() || (isExecutionConfirmation ? "📊" : "")
        const rawTitle = confirmationMatch[3].trim()
        const reportTitle = rawTitle.replace(/\s+Report Started$/i, "").replace(/\s+Raporu Başlatıldı$/i, "").replace(/\s+Raporu Hazırlandı$/i, "")
        const messageDesc = confirmationMatch[5]?.trim() || ""

        return (
          <p key={lIdx} className="leading-relaxed text-[12px]">
            {iconPrefix && (
              <span className="font-bold text-orange-500 dark:text-orange-400 mr-1">{iconPrefix}</span>
            )}
            <button
              type="button"
              onClick={() => {
                const navigated = navigateToReportOrJob(reportTitle)
                if (!navigated) {
                  sendPrompt(`${reportTitle} hazırla`)
                }
              }}
              title={`${reportTitle} ${isExecutionConfirmation ? "canlı sonuçlarını açmak" : "işlemini başlatmak"} için tıklayın`}
              className="font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline cursor-pointer transition-colors inline-flex items-center gap-0.5 mr-1 align-baseline group"
            >
              <span>{reportTitle}:</span>
              {isExecutionConfirmation && (
                <ArrowUpRight className="size-3 text-orange-500/80 dark:text-orange-400/80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
              )}
            </button>
            {messageDesc && <span className="text-foreground/90">{renderInlineEntities(messageDesc)}</span>}
          </p>
        )
      }

      // 3b. Madde İçi Başlık Tespiti: örn "* Stok Bakiye Raporu: Depolarınızdaki..."
      const bulletMatch = trimmed.match(/^([-*•]|\d+\.)\s+(\*\*)?([A-Za-zÇĞİÖŞÜçğıöşü0-9\s&/()_-]{3,50}?)(\*\*)?\s*:\s*(.+)$/i)
      if (bulletMatch) {
        const itemTitle = bulletMatch[3].trim()
        const itemDesc = bulletMatch[5].trim()

        return (
          <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1">
            <span className="text-orange-500/70 dark:text-orange-400/70 mt-1 shrink-0 text-[10px]">●</span>
            <div className="flex-1 leading-relaxed text-[12px]">
              <button
                type="button"
                onClick={() => {
                  if (isExecutionConfirmation) {
                    const navigated = navigateToReportOrJob(itemTitle)
                    if (navigated) return
                  }
                  sendPrompt(`${itemTitle} hazırla`)
                }}
                title={`${itemTitle} ${isExecutionConfirmation ? "sonuçlarını açmak" : "işlemini başlatmak"} için tıklayın`}
                className="font-semibold text-foreground hover:text-orange-600 dark:hover:text-orange-400 hover:underline cursor-pointer transition-colors mr-1 inline p-0 bg-transparent border-0 text-left text-[12px] align-baseline"
              >
                {itemTitle}:
              </button>
              <span className="text-foreground/90">{renderInlineEntities(itemDesc)}</span>
            </div>
          </div>
        )
      }

      // 3c. Standart Madde İşareti (Kolonsuz)
      if (/^([-*•]|\d+\.)\s+/.test(trimmed)) {
        const cleanBulletText = trimmed.replace(/^([-*•]|\d+\.)\s+/, "")
        const boldParts = cleanBulletText.split(/(\*\*[^*]+\*\*)/g)
        return (
          <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1">
            <span className="text-orange-500/70 dark:text-orange-400/70 mt-1 shrink-0 text-[10px]">●</span>
            <p className="flex-1 leading-relaxed text-[12px]">
              {boldParts.map((bp, bIdx) => {
                if (bp.startsWith("**") && bp.endsWith("**")) {
                  return (
                    <strong key={bIdx} className="font-semibold text-foreground">
                      {renderInlineEntities(bp.slice(2, -2))}
                    </strong>
                  )
                }
                return renderInlineEntities(bp)
              })}
            </p>
          </div>
        )
      }

      // 3d. Normal Paragraf & Kalınlaştırma (Bolding) & Varlık Eşleme
      const boldParts = line.split(/(\*\*[^*]+\*\*)/g)
      return (
        <p key={lIdx} className="leading-relaxed text-[12px]">
          {boldParts.map((bp, bIdx) => {
            if (bp.startsWith("**") && bp.endsWith("**")) {
              return (
                <strong key={bIdx} className="font-semibold text-foreground">
                  {renderInlineEntities(bp.slice(2, -2))}
                </strong>
              )
            }
            return renderInlineEntities(bp)
          })}
        </p>
      )
    })
  }

  return (
    <div className="space-y-2.5">
      {/* Doğal ve Temiz Metin Alanı */}
      <div className="max-w-[96%] text-[12px] text-foreground/90 space-y-1">
        {renderCleanContent(text)}
      </div>

      {/* Şık, Minimalist Önerilen Komutlar Kartları */}
      {suggestions.length > 0 && (
        <div className="pt-0.5 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
          {suggestions.slice(0, 4).map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => sendPrompt(s.prompt)}
              className="group inline-flex items-center justify-between gap-2.5 rounded-lg border border-orange-500/20 bg-orange-500/[0.04] hover:bg-orange-500/10 hover:border-orange-500/40 px-3 py-1.5 text-left text-[11.5px] text-foreground transition-all duration-150 cursor-pointer hover:shadow-2xs active:scale-[0.99]"
            >
              <span className="font-medium text-foreground/90 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                {s.label}
              </span>
              <ArrowUpRight className="size-3.5 text-orange-500/60 dark:text-orange-400/60 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TextPart({
  text,
  role,
  message,
}: {
  text: string
  role: UIMessage["role"]
  message?: UIMessage
}) {
  if (!text) return null

  // Skill çıktısı dosya token'ı: [[file:<mutlak yol>|<etiket>]] → tıkla & varsayılan uygulamada aç
  const FILE_TOKEN = /\[\[file:(.+?)\|(.+?)\]\]/g
  if (role !== "user" && FILE_TOKEN.test(text)) {
    FILE_TOKEN.lastIndex = 0
    const segments: Array<{ type: "text" | "file"; value: string; path?: string }> = []
    let last = 0
    for (const m of text.matchAll(FILE_TOKEN)) {
      if (m.index! > last) segments.push({ type: "text", value: text.slice(last, m.index) })
      segments.push({ type: "file", value: m[2], path: m[1] })
      last = m.index! + m[0].length
    }
    if (last < text.length) segments.push({ type: "text", value: text.slice(last) })

    return (
      <div className="text-[12px] leading-relaxed">
        {segments.map((seg, i) =>
          seg.type === "file" && seg.path ? (
            <FileOpenChip key={i} path={seg.path} label={seg.value} />
          ) : (
            <span key={i}>{seg.value}</span>
          )
        )}
      </div>
    )
  }

  if (role === "user") {
    return (
      <div className="ml-auto flex items-center max-w-[88%]">
        <div className="rounded-xl bg-muted px-2.5 py-2 text-[12px] leading-relaxed text-foreground">
          {text}
        </div>
      </div>
    )
  }

  return <FormattedAssistantText text={text} message={message} />
}

function FileOpenChip({ path, label }: { path: string; label: string }) {
  const [failed, setFailed] = React.useState(false)

  const open = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-shell")
      await open(path)
      setFailed(false)
    } catch (err) {
      console.warn("[FileChip] açılamadı:", err)
      setFailed(true)
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      title={failed ? `Açılamadı — yol: ${path}` : path}
      className={cn(
        "mx-0.5 inline-flex max-w-64 items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 align-middle text-[11px] font-medium shadow-xs transition-colors",
        failed
          ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
          : "cursor-pointer text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
      )}
    >
      <FileSpreadsheet className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

/** Avatar-free message row — user bubble right, assistant text + reasoning left. */
export function AiChatMessage({
  message,
  isLive,
  className,
}: AiChatMessageProps) {
  const isUser = message.role === "user"

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5",
        isUser ? "items-end" : "items-start",
        className
      )}
    >
      {message.parts?.map((part, index) => {
        if (part.type === "reasoning") {
          const meta = (part as { meta?: string }).meta
          return (
            <ReasoningPart
              key={`${message.id}-r-${index}`}
              text={part.text}
              isLive={isLive}
              meta={meta}
            />
          )
        }
        if (part.type === "text") {
          return (
            <TextPart
              key={`${message.id}-t-${index}`}
              text={part.text}
              role={message.role}
              message={message}
            />
          )
        }
        if (part.type === "custom") {
          const kindStr = String(part.kind)
          if (kindStr === "yula_chart_card" || kindStr.startsWith("yula_chart_")) {
            const chartData = (part as any).data || (message as any).toolResult
            if (chartData) {
              return <YulaAnalyticsCard key={`${message.id}-c-${index}`} data={chartData} />
            }
          }
          const CustomPart = yulaCustomPartComponents[part.kind]
          if (!CustomPart) return null
          return (
            <CustomPart
              key={`${message.id}-c-${index}`}
              data={(part as any).data}
              details={(part as any).details}
            />
          )
        }
        return null
      })}
    </div>
  )
}
