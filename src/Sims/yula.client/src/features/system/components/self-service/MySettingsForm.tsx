"use client";

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { emitLocaleChange } from "@/lib/locale-events"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { PageHeaderTitle } from "@/components/layout/page-header-title"
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell"
import { panelCardClass } from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldLabel,
} from "@/components/ui/field"
import {
  Timeline,
  TimelineItem,
  TimelineDot,
  TimelineContent,
  TimelineTitle,
  TimelineTime,
} from "@/components/ui/timeline"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Send,
  User as UserIcon,
  Settings,
  Paperclip,
  Share2,
  Copy,
  Pencil,
  Check,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react"
import { loadSecret, saveSecret } from "@/lib/secure-config"
import { normalizeEffort } from "@/lib/yula-reasoning"
import { cacheYulaClientAiConfigFromDb } from "@/lib/yula-ai-client-config"

export interface AiProviderConfig {
  provider: "ollama" | "azure" | "google" | "openai" | "agnes"
  model: string
  endpoint?: string
  apiKey?: string
  thinkingLevel?: "off" | "low" | "medium" | "high"
}

const CONFIG_STORAGE_KEY = "yula_ai_config"

/** Sunucu + ilk istemci render'ında birebir aynı başlangıç (hydration güvenli). */
const DEFAULT_AI_CONFIG: AiProviderConfig = {
  provider: "azure",
  model: "gpt-5.4",
  endpoint: "",
  apiKey: "",
  thinkingLevel: "low",
}

/**
 * Önbellek okuması — formun anlık ilk değeri için. Doğruluk kaynağı DB'dir
 * (`GET /api/my/settings`); form localStorage'a doğrudan yazmaz, PUT/GET
 * sonrası `cacheYulaClientAiConfigFromDb` aynalar.
 */
function loadStoredAiConfig(): AiProviderConfig {
  const defaults: AiProviderConfig = { ...DEFAULT_AI_CONFIG }
  if (typeof window === "undefined") return defaults
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (raw) {
      const parsed = { ...defaults, ...JSON.parse(raw) } as AiProviderConfig & { effort?: unknown }
      if (String(parsed.provider) === "foundry") parsed.provider = "azure"
      // Eski `effort` anahtarı `thinkingLevel`'e migrate edilir (değerler birebir).
      const migrated = normalizeEffort(parsed.effort ?? parsed.thinkingLevel ?? "")
      return { ...parsed, apiKey: "", thinkingLevel: migrated ?? parsed.thinkingLevel ?? "low" }
    }
  } catch {
    // fallback
  }
  return defaults
}

const SETTINGS_USER_ID = "local"
const SETTINGS_API_URL = `/api/my/settings?userId=${SETTINGS_USER_ID}`

type SettingsApiRow = {
  email?: string | null
  fullName?: string | null
  language?: string | null
  timeZone?: string | null
  aiProvider?: string | null
  aiModel?: string | null
  aiEndpoint?: string | null
  thinkingLevel?: string | null
  systemFacts?: Record<string, string> | null
}

const AI_PROVIDERS: AiProviderConfig["provider"][] = ["ollama", "azure", "google", "openai", "agnes"]

function normalizeApiProvider(value: unknown): AiProviderConfig["provider"] | undefined {
  if (typeof value !== "string") return undefined
  const v = value.trim().toLowerCase()
  return (AI_PROVIDERS as string[]).includes(v) ? (v as AiProviderConfig["provider"]) : undefined
}

function normalizeThinking(value: unknown): NonNullable<AiProviderConfig["thinkingLevel"]> {
  return normalizeEffort(value) ?? "low"
}

type ProfileLanguage = "english" | "turkish"
type ProfileTimeZone = "asia-kolkata" | "europe-istanbul"

function mapLanguageToUi(value: unknown): ProfileLanguage | undefined {
  if (typeof value !== "string") return undefined
  const v = value.trim().toLowerCase()
  if (v === "turkish" || v === "tr" || v === "türkçe") return "turkish"
  if (v === "english" || v === "en") return "english"
  return undefined
}

function syncLocaleCookie(lang: ProfileLanguage): void {
  if (typeof document === "undefined") return
  const code = lang === "turkish" ? "tr" : "en"
  document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000`
}

function mapTimeZoneToUi(value: unknown): ProfileTimeZone | undefined {
  if (typeof value !== "string") return undefined
  const v = value.trim().toLowerCase()
  if (v === "europe/istanbul" || v === "europe-istanbul") return "europe-istanbul"
  if (v === "asia/kolkata" || v === "asia-kolkata") return "asia-kolkata"
  return undefined
}

function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" }
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") }
}

/** API'ye tam snapshot yazar; sunucunun döndüğü satırı verir (önbellek senkronu için).
 * Offline/hatada null döner — çağrıcı önbelleğe dokunmaz (son iyi değer kalır). */
async function putSettingsToApi(snapshot: {
  email: string
  fullName: string
  language: ProfileLanguage
  timeZone: ProfileTimeZone
  aiProvider: AiProviderConfig["provider"]
  aiModel: string
  aiEndpoint: string
  thinkingLevel: NonNullable<AiProviderConfig["thinkingLevel"]>
  systemFacts: Record<string, string>
}): Promise<SettingsApiRow | null> {
  // Kişisel tercihler (AI config, dil, tz, systemFacts) → user_settings
  try {
    const res = await fetch("/api/my/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: SETTINGS_USER_ID,
        language: snapshot.language,
        timeZone: snapshot.timeZone,
        aiProvider: snapshot.aiProvider,
        aiModel: snapshot.aiModel,
        aiEndpoint: snapshot.aiEndpoint,
        thinkingLevel: snapshot.thinkingLevel,
        systemFacts: snapshot.systemFacts,
      }),
    })
    if (res.ok) {
      const data = (await res.json()) as { settings?: SettingsApiRow | null }
      return data?.settings ?? null
    }
    return null
  } catch {
    // offline (Tauri) veya backend kapalı — önbellek aynalanmaz
    return null
  } finally {
    // Ad/e-posta → app_users (tek kaynak)
    try {
      await fetch("/api/system/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: SETTINGS_USER_ID,
          name: snapshot.fullName || null,
          email: snapshot.email || null,
          role: "System Administrator",
          status: "Active",
          lastActive: "Now",
        }),
      })
    } catch {
      // sessiz geç
    }
  }
}

export function MySettingsForm() {
  const t = useTranslations("MySettings")
  const tc = useTranslations("Common")
  const locale = useLocale()
  const [isEnabled, setIsEnabled] = React.useState(true)
  const [changePasswordOpen, setChangePasswordOpen] = React.useState(false)
  const [documentFollowOpen, setDocumentFollowOpen] = React.useState(false)
  const [emailOpen, setEmailOpen] = React.useState(false)
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false)
  const [appOpen, setAppOpen] = React.useState(false)
  const [thirdPartyAuthOpen, setThirdPartyAuthOpen] = React.useState(true)
  const [yulaAiSettingsOpen, setYulaAiSettingsOpen] = React.useState(true)
  const [systemFactsOpen, setSystemFactsOpen] = React.useState(false)

  const [systemFacts, setSystemFacts] = React.useState<Record<string, string>>({})
  const [factKey, setFactKey] = React.useState("")
  const [factValue, setFactValue] = React.useState("")
  const [factSaved, setFactSaved] = React.useState(false)

  // Hydration güvenliği: ilk render her zaman DEFAULT_AI_CONFIG ile olur
  // (sunucuyla birebir); kayıtlı config mount effect'inde yüklenir.
  const [aiConfig, setAiConfigState] = React.useState<AiProviderConfig>(DEFAULT_AI_CONFIG)
  const [configHydrated, setConfigHydrated] = React.useState(false)

  const [aiProvider, setAiProvider] = React.useState<AiProviderConfig["provider"]>(aiConfig.provider)
  const [aiModel, setAiModel] = React.useState(aiConfig.model)
  const [aiEndpoint, setAiEndpoint] = React.useState(aiConfig.endpoint || "")
  const [aiApiKey, setAiApiKey] = React.useState(aiConfig.apiKey || "")
  const [aiThinkingLevel, setAiThinkingLevel] =
    React.useState<NonNullable<AiProviderConfig["thinkingLevel"]>>(aiConfig.thinkingLevel || "low")
  const [showApiKey, setShowApiKey] = React.useState(false)

  // User Details sekmesi — API'ye bağlı profil alanları (görünüm aynı, kontrollü input).
  const [profileEmail, setProfileEmail] = React.useState("john.doe@demo.com")
  const [profileFullName, setProfileFullName] = React.useState("John Doe")
  const [profileFirstName, setProfileFirstName] = React.useState("John")
  const [profileLastName, setProfileLastName] = React.useState("Doe")
  const [profileUsername, setProfileUsername] = React.useState("johndoe")
  const [profileLanguage, setProfileLanguage] = React.useState<ProfileLanguage>("english")
  const [profileTimeZone, setProfileTimeZone] = React.useState<ProfileTimeZone>("asia-kolkata")
  const [profileSaved, setProfileSaved] = React.useState(false)
  const [profileLoaded, setProfileLoaded] = React.useState(false)

  // Sekme derin bağlantısı: menüden `?tab=settings` (Tercihler) /
  // `?tab=user-details` (Profil) ile gelinir; sekme tıklaması da URL'yi
  // günceller (replace, scroll yok) — yenileme/derin bağlantı korunur.
  // Aynı sayfada menüden ikinci tıklamada remount olmadığı için param
  // değişimi state'e senkronlanır.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const isSettingsTab = (v: string | null): v is "user-details" | "settings" | "yula-ai" | "connections" =>
    v === "user-details" || v === "settings" || v === "yula-ai" || v === "connections"
  const [activeTab, setActiveTab] = React.useState<"user-details" | "settings" | "yula-ai" | "connections">(
    isSettingsTab(tabParam) ? tabParam : "user-details",
  )
  React.useEffect(() => {
    if (isSettingsTab(tabParam)) setActiveTab(tabParam)
  }, [tabParam])
  const handleTabChange = (v: string) => {
    if (!isSettingsTab(v)) return
    setActiveTab(v)
    router.replace(`${pathname}?tab=${v}`, { scroll: false })
  }

  // Güvenli depodan API anahtarı yüklendiğinde / config değiştiğinde formu
  // senkronla — render sırasında state ayarlama (effect'siz türev).
  const [syncedAiConfig, setSyncedAiConfig] = React.useState<AiProviderConfig | null>(null)
  const [syncedHydrated, setSyncedHydrated] = React.useState(false)
  if (syncedAiConfig !== aiConfig || syncedHydrated !== configHydrated) {
    setSyncedAiConfig(aiConfig)
    setSyncedHydrated(configHydrated)
    if (configHydrated) {
      setAiProvider(aiConfig.provider)
      setAiModel(aiConfig.model)
      setAiEndpoint(aiConfig.endpoint || "")
      setAiApiKey(aiConfig.apiKey || "")
      setAiThinkingLevel(aiConfig.thinkingLevel || "low")
    }
  }

  // API anahtarını güvenli depodan oku + DB'deki ayarı çek (doğruluk kaynağı).
  // Önbellek yalnızca anlık ilk değer içindir; DB gelince form + önbellek DB'den beslenir.
  React.useEffect(() => {
    let active = true
    // Kayıtlı AI config'i hydration SONRASI yükle (ilk render varsayılan).
    setAiConfigState(loadStoredAiConfig())
    loadSecret().then((secret) => {
      if (!active) return
      setAiApiKey(secret || "")
      setAiConfigState((prev) => ({ ...prev, apiKey: secret || "" }))
      setConfigHydrated(true)
    })
    fetch(SETTINGS_API_URL, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { settings?: SettingsApiRow | null } | null) => {
        if (!active) return
        const row = data?.settings
        if (row) {
          // DB → önbellek aynası (sohbet sıcak yolu + offline buradan beslenir).
          cacheYulaClientAiConfigFromDb(row)
          const provider = normalizeApiProvider(row.aiProvider)
          const thinking = normalizeThinking(row.thinkingLevel)
          setAiConfigState((prev) => ({
            ...prev,
            provider: provider ?? prev.provider,
            model: typeof row.aiModel === "string" && row.aiModel ? row.aiModel : prev.model,
            endpoint: typeof row.aiEndpoint === "string" ? row.aiEndpoint : prev.endpoint,
            thinkingLevel: row.thinkingLevel != null ? thinking : prev.thinkingLevel,
          }))
          if (row.systemFacts && typeof row.systemFacts === "object") {
            setSystemFacts(row.systemFacts)
          }
          // Profil alanları — API'de kayıt varsa formu doldur (yoksa demo değerler kalır).
          if (typeof row.email === "string" && row.email) setProfileEmail(row.email)
          if (typeof row.fullName === "string" && row.fullName) {
            setProfileFullName(row.fullName)
            const split = splitFullName(row.fullName)
            setProfileFirstName(split.first || "John")
            setProfileLastName(split.last || "Doe")
          }
          const lang = mapLanguageToUi(row.language)
          if (lang) setProfileLanguage(lang)
          const tz = mapTimeZoneToUi(row.timeZone)
          if (tz) setProfileTimeZone(tz)
        }
        // GET tamamlandı (kayıt yoksa da) — Save artık güvenli.
        setProfileLoaded(true)
      })
      .catch(() => {
        // offline — localStorage fallback
        if (active) setProfileLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  /**
   * Dil kaydedildiğinde: cookie'yi senkronize et; hedef locale mevcut sayfadan
   * farklıysa `yula:locale-changed` yayını yap ve sayfa yenilensin (UI yeni
   * dile geçsin). Combo değişiminde otomatik reload YOK — yalnız kayıt anında.
   * Dinleyiciler bu pencerede YALNIZ senkron kalıcılık işlemleri yapar
   * (`setState` yasak; bkz. `locale-events.ts` sözleşmesi).
   *
   * `persisted` parametresi: DB kalıcılığı (PUT + secret) tamamlanana dek
   * reload tetiklenmez — dil değişikliği + in-flight isteklerin eşzamanlı
   * abort'u Turbopack dev sunucusunda yarış hatası üretmesin. Ağ çökse bile
   * 3 sn üst sınır sonrası reload garantili (suzma davranış bozulmaz).
   * Dil değişmediyse hiç reload olmaz; gecikme etkisizdir.
   */
  const applyLanguageChange = (
    lang: ProfileLanguage,
    persisted?: Promise<unknown>,
  ) => {
    syncLocaleCookie(lang)
    const code = lang === "turkish" ? "tr" : "en"
    if (code === locale) return
    emitLocaleChange(code)
    // `persisted` (PUT + secret) biter bitmez reload; takılırsa 3 sn üst sınırdan
    // sonra yine reload — in-flight abort yarışı oluşmaz, suzma bozulmaz.
    // (persisted zaten `.catch(() => undefined)` ile hiç reddetmez; cap reddetmez.
    //  `Promise.race` = ikisinin önceki çözüleni → "bitti YADA zaman doldu".)
    const cap = new Promise<void>((r) => window.setTimeout(r, 3000))
    void Promise.race([persisted ?? Promise.resolve(), cap]).then(() => {
      window.setTimeout(() => window.location.reload(), 150)
    })
  }

  /** Header Save butonu — DB'ye yazar, başarılıysa önbelleği DB'den aynalar.
   * Form localStorage'a doğrudan yazmaz; secret sessionStorage'da yaşar.
   * Bölüm içi ayrı kaydet butonu yok. */
  const handleSaveProfile = () => {
    const full = profileFullName.trim() || `${profileFirstName} ${profileLastName}`.trim()
    if (profileEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileEmail.trim())) return
    // AI snapshot — sohbet hattı önbellekten (`yula_ai_config`) okur.
    const updatedAi: AiProviderConfig = {
      provider: aiProvider,
      model: aiModel,
      endpoint: aiEndpoint,
      apiKey: aiApiKey,
      thinkingLevel: aiThinkingLevel,
    }
    setAiConfigState(updatedAi)
    // Dil değiştiyse reload, kalıcılık tamamlanana dek bekler (abort yarışı yok).
    const secretP = saveSecret(aiApiKey).catch(() => undefined)
    const putP = putSettingsToApi({
      email: profileEmail.trim(),
      fullName: full,
      language: profileLanguage,
      timeZone: profileTimeZone,
      aiProvider,
      aiModel,
      aiEndpoint,
      thinkingLevel: aiThinkingLevel,
      systemFacts,
    })
      .then((row) => {
        // Yalnızca DB yazımı başarılıysa önbelleği aynala (tek yön: DB → cache).
        if (row) cacheYulaClientAiConfigFromDb(row)
      })
      .catch(() => undefined)
    applyLanguageChange(profileLanguage, Promise.all([secretP, putP]))
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2500)
  }

  const handleFullNameChange = (value: string) => {
    setProfileFullName(value)
    const split = splitFullName(value)
    if (split.first) setProfileFirstName(split.first)
    setProfileLastName(split.last)
  }

  const handleFirstNameChange = (value: string) => {
    setProfileFirstName(value)
    setProfileFullName(`${value} ${profileLastName}`.trim())
  }

  const handleLastNameChange = (value: string) => {
    setProfileLastName(value)
    setProfileFullName(`${profileFirstName} ${value}`.trim())
  }

  const handleSaveSystemFact = () => {
    const k = factKey.trim()
    const v = factValue.trim()
    if (!k || !v) return
    const next = { ...systemFacts, [k]: v }
    setSystemFacts(next)
    void putSettingsToApi({
      email: profileEmail,
      fullName: profileFullName,
      language: profileLanguage,
      timeZone: profileTimeZone,
      aiProvider,
      aiModel,
      aiEndpoint,
      thinkingLevel: aiThinkingLevel,
      systemFacts: next,
    })
    setFactKey("")
    setFactValue("")
    setFactSaved(true)
    setTimeout(() => setFactSaved(false), 2500)
  }

  const handleDeleteSystemFact = (key: string) => {
    const k = key.trim()
    if (!k) return
    const next = { ...systemFacts }
    delete next[k]
    setSystemFacts(next)
    void putSettingsToApi({
      email: profileEmail,
      fullName: profileFullName,
      language: profileLanguage,
      timeZone: profileTimeZone,
      aiProvider,
      aiModel,
      aiEndpoint,
      thinkingLevel: aiThinkingLevel,
      systemFacts: next,
    })
  }

  const handleProviderChange = (newProvider: AiProviderConfig["provider"]) => {
    setAiProvider(newProvider)
    if (newProvider === "ollama") {
      setAiModel("gemma4:12b-mlx")
      setAiEndpoint("http://127.0.0.1:11434")
    } else if (newProvider === "google") {
      setAiModel("gemini-2.5-flash")
      setAiEndpoint("https://generativelanguage.googleapis.com")
    } else if (newProvider === "azure") {
      setAiModel("gpt-5.4")
      setAiEndpoint("https://tmandali-resource.services.ai.azure.com/openai/v1")
    } else if (newProvider === "openai") {
      setAiModel("gpt-4o-mini")
      setAiEndpoint("https://api.openai.com/v1")
    } else if (newProvider === "agnes") {
      setAiModel("agnes-2.5-flash")
      setAiEndpoint("https://apihub.agnes-ai.com/v1")
    }
  }

  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>{t("title")}</PageHeaderTitle>}
      showSearch={false}
      actions={
        <>
          <Select defaultValue="password">
              <SelectTrigger className="h-7 gap-1 px-2.5 text-xs font-normal">
                <SelectValue placeholder={t("pwd_password")} />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="password">{t("pwd_password")}</SelectItem>
                <SelectItem value="set-password">{t("pwd_set")}</SelectItem>
                <SelectItem value="reset-password">{t("pwd_reset")}</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center divide-x rounded-md border">
              <Button variant="ghost" size="icon" className="size-7 rounded-none">
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7 rounded-none">
                <ChevronRight className="size-3.5" />
              </Button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-7">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>{t("menu_user_permissions")}</DropdownMenuItem>
                <DropdownMenuItem>{t("menu_reload")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={handleSaveProfile}
              disabled={!profileLoaded}
            >
              {profileSaved ? tc("saved") : tc("save")}
            </Button>

            <AIChatAssistant />
          </>
        }
      >
          <div className={cn(panelCardClass, "min-h-0 flex-1")}>
            <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-primary/15 px-4 py-1 dark:border-primary/25">
                <TabsList variant="line">
                  <TabsTrigger value="user-details">{t("tab_user_details")}</TabsTrigger>
                  <TabsTrigger value="settings">{t("tab_settings")}</TabsTrigger>
                  <TabsTrigger value="yula-ai">{t("tab_yula_ai")}</TabsTrigger>
                  <TabsTrigger value="connections">{t("tab_connections")}</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="user-details" className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
                <div className="flex-1 p-6 space-y-6">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="enabled"
                      checked={isEnabled}
                      onCheckedChange={(c) => setIsEnabled(!!c)}
                    />
                    <Label htmlFor="enabled" className="text-xs font-semibold cursor-pointer text-foreground select-none">
                      {t("enabled")}
                    </Label>
                  </div>

                  <div className="space-y-4 pt-2">
                    <h3 className="text-xs font-semibold text-foreground">{t("basic_info")}</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">
                          {t("field_email")} <span className="text-red-500">*</span>
                        </FieldLabel>
                        <Input
                          value={profileEmail}
                          onChange={(e) => setProfileEmail(e.target.value)}
                          className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                        />
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">{t("field_full_name")}</FieldLabel>
                        <Input
                          value={profileFullName}
                          onChange={(e) => handleFullNameChange(e.target.value)}
                          className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                        />
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">{t("field_language")}</FieldLabel>
                        <Select
                          value={profileLanguage}
                          onValueChange={(val: ProfileLanguage) => setProfileLanguage(val)}
                        >
                          <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                            <SelectValue placeholder={t("field_language")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="english">{t("lang_english")}</SelectItem>
                            <SelectItem value="turkish">{t("lang_turkish")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">
                          {t("field_first_name")} <span className="text-red-500">*</span>
                        </FieldLabel>
                        <Input
                          value={profileFirstName}
                          onChange={(e) => handleFirstNameChange(e.target.value)}
                          className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                        />
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">{t("field_username")}</FieldLabel>
                        <Input
                          value={profileUsername}
                          onChange={(e) => setProfileUsername(e.target.value)}
                          className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                        />
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">{t("field_time_zone")}</FieldLabel>
                        <Select
                          value={profileTimeZone}
                          onValueChange={(val: ProfileTimeZone) => setProfileTimeZone(val)}
                        >
                          <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                            <SelectValue placeholder={t("field_time_zone")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asia-kolkata">Asia/Kolkata</SelectItem>
                            <SelectItem value="europe-istanbul">Europe/Istanbul</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">{t("field_last_name")}</FieldLabel>
                        <Input
                          value={profileLastName}
                          onChange={(e) => handleLastNameChange(e.target.value)}
                          className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                        />
                      </Field>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">{t("comments")}</h3>

                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                          JD
                        </AvatarFallback>
                      </Avatar>
                      <div className="relative flex-1">
                        <Input
                          placeholder={t("comment_placeholder")}
                          className="bg-muted/20 border-muted-foreground/20 h-9 text-xs pr-10"
                        />
                        <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7 text-muted-foreground hover:text-foreground">
                          <Send className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{t("activity")}</h3>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                        <Plus className="size-3.5 mr-1" /> {t("new_email")}
                      </Button>
                    </div>

                    <Timeline>
                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> {t("act_changed_username")}{" "}
                            <span className="font-medium">john</span> → <span className="font-medium">johndoe</span> ·{" "}
                            <TimelineTime>{t("time_year_ago")}</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> {t("act_last_edited")} ·{" "}
                            <TimelineTime>{t("time_year_ago")}</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> {t("act_added_rows")} {t("act_social_logins")} ·{" "}
                            <TimelineTime>{t("time_year_ago")}</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> {t("act_removed_rows")} {t("act_social_logins")} ·{" "}
                            <TimelineTime>{t("time_year_ago")}</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>
                    </Timeline>
                  </div>
                </div>

                <div className="w-full lg:w-72 border-l p-4 space-y-6 text-xs bg-muted/10">
                  <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-sm text-foreground">{profileFullName}</h4>
                        <p className="text-muted-foreground text-xs font-mono">{profileEmail}</p>
                      </div>
                    <Button variant="ghost" size="icon" className="size-6">
                      <Copy className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-1">
                    <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <UserIcon className="size-3.5" />
                        {t("assign")}
                      </span>
                      <Plus className="size-3.5" />
                    </Button>

                    <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <Paperclip className="size-3.5" />
                        {t("attachments")}
                      </span>
                      <Plus className="size-3.5" />
                    </Button>

                    <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <Share2 className="size-3.5" />
                        {t("share")}
                      </span>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-3 text-muted-foreground text-[11px]">
                    <div>
                      <p className="font-medium text-foreground">Administrator</p>
                      <p>{t("last_edited")} · {t("time_year_ago")}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Administrator</p>
                      <p>{t("created")} · {t("time_year_ago")}</p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="yula-ai" className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
                <div className="flex-1 p-6 space-y-6">
                  <div className="space-y-3">
                    <Collapsible open={yulaAiSettingsOpen} onOpenChange={setYulaAiSettingsOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>{t("ai_title")}</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            yulaAiSettingsOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 space-y-4">
                        <p className="text-xs text-muted-foreground">
                          {t("ai_description")}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Field>
                            <FieldLabel className="text-xs text-muted-foreground">
                              {t("ai_provider")}
                            </FieldLabel>
                            <Select
                              value={aiProvider}
                              onValueChange={(val: any) => handleProviderChange(val)}
                            >
                              <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                                <SelectValue placeholder={t("ai_provider_ph")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="azure">Microsoft Foundry (Azure OpenAI)</SelectItem>
                                <SelectItem value="ollama">{t("provider_ollama")}</SelectItem>
                                <SelectItem value="openai">OpenAI / Custom OpenAI-Compatible</SelectItem>
                                <SelectItem value="agnes">Agnes (agnes-2.5-flash)</SelectItem>
                                <SelectItem value="google">Google AI SDK (Gemini 2.5 Flash / Pro)</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>

                          <Field>
                            <FieldLabel className="text-xs text-muted-foreground">
                              {t("ai_model")}
                            </FieldLabel>
                            <Input
                              value={aiModel}
                              onChange={(e) => setAiModel(e.target.value)}
                              placeholder="gemma4:12b-mlx, gemini-2.5-flash, gpt-4o-mini"
                              className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                            />
                          </Field>

                          <Field>
                            <FieldLabel className="text-xs text-muted-foreground">
                              {t("ai_endpoint")}
                            </FieldLabel>
                            <Input
                              value={aiEndpoint}
                              onChange={(e) => setAiEndpoint(e.target.value)}
                              placeholder="http://127.0.0.1:11434 or https://your-resource.openai.azure.com/"
                              className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                            />
                          </Field>

                          <Field>
                            <FieldLabel className="text-xs text-muted-foreground">
                              {t("ai_api_key")}
                            </FieldLabel>
                            <div className="relative">
                              <Input
                                type={showApiKey ? "text" : "password"}
                                value={aiApiKey}
                                onChange={(e) => setAiApiKey(e.target.value)}
                                placeholder={aiProvider === "ollama" ? t("ai_api_key_ph_local") : "sk-..."}
                                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                              >
                                {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                              </button>
                            </div>
                          </Field>

                          <Field>
                            <FieldLabel className="text-xs text-muted-foreground">
                              {t("ai_thinking")}
                            </FieldLabel>
                            <Select
                              value={aiThinkingLevel}
                              onValueChange={(val: NonNullable<AiProviderConfig["thinkingLevel"]>) =>
                                setAiThinkingLevel(val)
                              }
                            >
                              <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                                <SelectValue placeholder={t("ai_thinking_ph")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="off">{t("think_off")}</SelectItem>
                                <SelectItem value="low">{t("think_low")}</SelectItem>
                                <SelectItem value="medium">{t("think_medium")}</SelectItem>
                                <SelectItem value="high">{t("think_high")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">
                              {t("ai_thinking_note")}
                            </p>
                          </Field>
                        </div>

                        <div className="pt-1">
                          <span className="text-xs text-muted-foreground">
                            {t("ai_active")} <strong className="text-foreground">{aiProvider.toUpperCase()}</strong> ({aiModel})
                          </span>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="settings" className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
                <div className="flex-1 p-6 space-y-6">
                  <div className="space-y-3">
                    <Collapsible open={systemFactsOpen} onOpenChange={setSystemFactsOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>{t("facts_title")}</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            systemFactsOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          {t("facts_description")}
                        </p>

                        {Object.keys(systemFacts).length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">{t("facts_empty")}</p>
                        ) : (
                          <div className="space-y-1.5">
                            {Object.entries(systemFacts)
                              .sort(([a], [b]) => a.localeCompare(b, "tr"))
                              .map(([k, v]) => (
                                <div
                                  key={k}
                                  className="flex items-center gap-2 rounded-md border border-muted-foreground/15 bg-muted/20 px-2.5 py-1.5"
                                >
                                  <span className="text-xs font-semibold text-foreground">{k}</span>
                                  <span className="text-xs text-muted-foreground truncate flex-1">{v}</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 text-muted-foreground hover:text-red-500"
                                    aria-label={t("fact_delete_aria", { key: k })}
                                    onClick={() => handleDeleteSystemFact(k)}
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                </div>
                              ))}
                          </div>
                        )}

                        <div className="flex items-end gap-2 pt-1">
                          <div className="w-44">
                            <Input
                              value={factKey}
                              onChange={(e) => setFactKey(e.target.value)}
                              placeholder={t("fact_key_ph")}
                              className="bg-muted/30 border-muted-foreground/20 h-9 text-xs"
                            />
                          </div>
                          <Input
                            value={factValue}
                            onChange={(e) => setFactValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveSystemFact()
                            }}
                            placeholder={t("fact_value_ph")}
                            className="flex-1 bg-muted/30 border-muted-foreground/20 h-9 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSaveSystemFact}
                            disabled={!factKey.trim() || !factValue.trim()}
                            className="h-9 px-3 text-xs gap-1.5"
                          >
                            {factSaved ? (
                              <>
                                <Check className="size-3 text-emerald-300" />
                                {t("fact_remembered")}
                              </>
                            ) : (
                              t("fact_remember")
                            )}
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={changePasswordOpen} onOpenChange={setChangePasswordOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>{t("pwd_section_title")}</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            changePasswordOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground space-y-3">
                        <p>{t("pwd_body")}</p>
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={documentFollowOpen} onOpenChange={setDocumentFollowOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>{t("doc_title")}</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            documentFollowOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                        {t("doc_body")}
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={emailOpen} onOpenChange={setEmailOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>{t("email_title")}</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            emailOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                        {t("email_body")}
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={workspaceOpen} onOpenChange={setWorkspaceOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>{t("ws_title")}</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            workspaceOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                        {t("ws_body")}
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={appOpen} onOpenChange={setAppOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>{t("app_title")}</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            appOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                        {t("app_body")}
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={thirdPartyAuthOpen} onOpenChange={setThirdPartyAuthOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>{t("tpa_title")}</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            thirdPartyAuthOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
<CollapsibleContent className="pt-4 space-y-3">
                        <h4 className="text-xs font-medium text-muted-foreground">{t("social_logins")}</h4>
                        
                        <div className="rounded-md border bg-card overflow-hidden">
                          <Table>
                            <TableHeader className="bg-muted/40 text-xs">
                              <TableRow className="border-b hover:bg-transparent">
                                <TableHead className="w-10 text-center">
                                  <Checkbox />
                                </TableHead>
                                <TableHead className="w-12">No.</TableHead>
                                <TableHead>Provider</TableHead>
                                <TableHead>Username</TableHead>
                                <TableHead>User ID</TableHead>
                                <TableHead className="w-10 text-center">
                                  <Settings className="size-3.5 mx-auto text-muted-foreground" />
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y text-xs">
                              <TableRow>
                                <TableCell className="text-center">
                                  <Checkbox />
                                </TableCell>
                                <TableCell className="font-medium text-foreground">1</TableCell>
                                <TableCell className="font-medium text-foreground">{t("provider_ollama")}</TableCell>
                                <TableCell className="text-muted-foreground"></TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  4a770832b401964e1dc7d3ecd080...
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button variant="ghost" size="icon" className="size-6 text-muted-foreground">
                                    <Pencil className="size-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>

                  <Separator className="my-6" />

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">{t("comments")}</h3>

                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                          JD
                        </AvatarFallback>
                      </Avatar>
                      <div className="relative flex-1">
                        <Input
                          placeholder={t("comment_placeholder")}
                          className="bg-muted/20 border-muted-foreground/20 h-9 text-xs pr-10"
                        />
                        <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7 text-muted-foreground hover:text-foreground">
                          <Send className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{t("activity")}</h3>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                        <Plus className="size-3.5 mr-1" /> {t("new_email")}
                      </Button>
                    </div>

                    <Timeline>
                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> {t("act_changed_username")}{" "}
                            <span className="font-medium">john</span> → <span className="font-medium">johndoe</span> ·{" "}
                            <TimelineTime>{t("time_year_ago")}</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> {t("act_last_edited")} ·{" "}
                            <TimelineTime>{t("time_year_ago")}</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> {t("act_added_rows")} {t("act_social_logins")} ·{" "}
                            <TimelineTime>{t("time_year_ago")}</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> {t("act_removed_rows")} {t("act_social_logins")} ·{" "}
                            <TimelineTime>{t("time_year_ago")}</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>
                    </Timeline>
                  </div>
                </div>

                <div className="w-full lg:w-72 border-l p-4 space-y-6 text-xs bg-muted/10">
                  <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-sm text-foreground">{profileFullName}</h4>
                        <p className="text-muted-foreground text-xs font-mono">{profileEmail}</p>
                      </div>
                    <Button variant="ghost" size="icon" className="size-6">
                      <Copy className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-1">
                    <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <UserIcon className="size-3.5" />
                        {t("assign")}
                      </span>
                      <Plus className="size-3.5" />
                    </Button>

                    <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <Paperclip className="size-3.5" />
                        {t("attachments")}
                      </span>
                      <Plus className="size-3.5" />
                    </Button>

                    <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <Share2 className="size-3.5" />
                        {t("share")}
                      </span>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-3 text-muted-foreground text-[11px]">
                    <div>
                      <p className="font-medium text-foreground">Administrator</p>
                      <p>{t("last_edited")} · {t("time_year_ago")}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Administrator</p>
                      <p>{t("created")} · {t("time_year_ago")}</p>
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="connections" className="p-6 m-0 text-xs text-muted-foreground">
                {t("connections_body")}
              </TabsContent>
            </Tabs>
          </div>
    </WorkspacePageShell>
  )
}
