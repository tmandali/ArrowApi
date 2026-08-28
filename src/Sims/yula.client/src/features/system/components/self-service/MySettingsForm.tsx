"use client";

import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { panelCardClass, pageContentGutterClass } from "@/components/layout/panel-chrome"
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

export interface AiProviderConfig {
  provider: "ollama" | "azure" | "google" | "openai"
  model: string
  endpoint?: string
  apiKey?: string
  thinkingLevel?: "off" | "low" | "medium" | "high"
}

const CONFIG_STORAGE_KEY = "yula_ai_config"

function loadStoredAiConfig(): AiProviderConfig {
  const defaults: AiProviderConfig = {
    provider: "ollama",
    model: "gemma4:12b-mlx",
    endpoint: "http://127.0.0.1:11434",
    apiKey: "",
    thinkingLevel: "low",
  }
  if (typeof window === "undefined") return defaults
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (raw) {
      const parsed = { ...defaults, ...JSON.parse(raw) } as AiProviderConfig
      return { ...parsed, apiKey: "" }
    }
  } catch {
    // fallback
  }
  return defaults
}

function persistAiConfigWithoutSecret(config: AiProviderConfig) {
  if (typeof window === "undefined") return
  try {
    const { apiKey: _apiKey, ...sanitized } = config
    void _apiKey
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(sanitized))
  } catch {
    // storage unavailable
  }
}

export function MySettingsForm() {
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

  const [aiConfig, setAiConfigState] = React.useState<AiProviderConfig>(loadStoredAiConfig)
  const [configHydrated, setConfigHydrated] = React.useState(false)

  const [aiProvider, setAiProvider] = React.useState<AiProviderConfig["provider"]>(aiConfig.provider)
  const [aiModel, setAiModel] = React.useState(aiConfig.model)
  const [aiEndpoint, setAiEndpoint] = React.useState(aiConfig.endpoint || "")
  const [aiApiKey, setAiApiKey] = React.useState(aiConfig.apiKey || "")
  const [aiThinkingLevel, setAiThinkingLevel] =
    React.useState<NonNullable<AiProviderConfig["thinkingLevel"]>>(aiConfig.thinkingLevel || "low")
  const [showApiKey, setShowApiKey] = React.useState(false)
  const [aiSaved, setAiSaved] = React.useState(false)

  // API anahtarını güvenli depodan oku
  React.useEffect(() => {
    let active = true
    loadSecret().then((secret) => {
      if (!active) return
      setAiApiKey(secret || "")
      setAiConfigState((prev) => ({ ...prev, apiKey: secret || "" }))
      setConfigHydrated(true)
    })
    return () => {
      active = false
    }
  }, [])

  // Güvenli depodan API anahtarı yüklendiğinde formu senkronla
  React.useEffect(() => {
    if (!configHydrated) return
    setAiProvider(aiConfig.provider)
    setAiModel(aiConfig.model)
    setAiEndpoint(aiConfig.endpoint || "")
    setAiApiKey(aiConfig.apiKey || "")
    setAiThinkingLevel(aiConfig.thinkingLevel || "low")
  }, [configHydrated, aiConfig])

  const handleSaveAiConfig = () => {
    const updated: AiProviderConfig = {
      provider: aiProvider,
      model: aiModel,
      endpoint: aiEndpoint,
      apiKey: aiApiKey,
      thinkingLevel: aiThinkingLevel,
    }
    setAiConfigState(updated)
    persistAiConfigWithoutSecret(updated)
    void saveSecret(aiApiKey)
    setAiSaved(true)
    setTimeout(() => setAiSaved(false), 2500)
  }

  const handleSaveSystemFact = () => {
    const k = factKey.trim()
    const v = factValue.trim()
    if (!k || !v) return
    setSystemFacts((prev) => ({ ...prev, [k]: v }))
    setFactKey("")
    setFactValue("")
    setFactSaved(true)
    setTimeout(() => setFactSaved(false), 2500)
  }

  const handleDeleteSystemFact = (key: string) => {
    const k = key.trim()
    if (!k) return
    setSystemFacts((prev) => {
      const copy = { ...prev }
      delete copy[k]
      return copy
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
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspacePageHeader
        showSearch={false}
        actions={
          <>
            <Select defaultValue="password">
              <SelectTrigger className="h-7 gap-1 px-2.5 text-xs font-normal">
                <SelectValue placeholder="Password" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="password">Password</SelectItem>
                <SelectItem value="set-password">Set Password</SelectItem>
                <SelectItem value="reset-password">Reset Password</SelectItem>
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
                <DropdownMenuItem>User Permissions</DropdownMenuItem>
                <DropdownMenuItem>Reload</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" className="h-7 px-3 text-xs">
              Save
            </Button>

            <AIChatAssistant />
          </>
        }
      >
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink href="#">My Account</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-foreground">
                Profile & Settings
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </WorkspacePageHeader>

      <WorkspaceAiDock>
        <div
          className={cn(
            pageContentGutterClass,
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          )}
        >
          <div className={cn(panelCardClass, "min-h-0 flex-1")}>
            <Tabs defaultValue="user-details" className="flex flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-primary/15 px-4 py-1 dark:border-primary/25">
                <TabsList variant="line">
                  <TabsTrigger value="user-details">User Details</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                  <TabsTrigger value="connections">Connections</TabsTrigger>
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
                      Enabled
                    </Label>
                  </div>

                  <div className="space-y-4 pt-2">
                    <h3 className="text-xs font-semibold text-foreground">Basic Info</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">
                          Email <span className="text-red-500">*</span>
                        </FieldLabel>
                        <Input
                          defaultValue="john.doe@demo.com"
                          className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                        />
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">Full Name</FieldLabel>
                        <Input
                          defaultValue="John Doe"
                          className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                        />
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">Language</FieldLabel>
                        <Select defaultValue="english">
                          <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                            <SelectValue placeholder="Language" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="english">English</SelectItem>
                            <SelectItem value="turkish">Turkish</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">
                          First Name <span className="text-red-500">*</span>
                        </FieldLabel>
                        <Input
                          defaultValue="John"
                          className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                        />
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">Username</FieldLabel>
                        <Input
                          defaultValue="johndoe"
                          className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                        />
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">Time Zone</FieldLabel>
                        <Select defaultValue="asia-kolkata">
                          <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                            <SelectValue placeholder="Time Zone" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asia-kolkata">Asia/Kolkata</SelectItem>
                            <SelectItem value="europe-istanbul">Europe/Istanbul</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">Last Name</FieldLabel>
                        <Input
                          defaultValue="Doe"
                          className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                        />
                      </Field>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Comments</h3>

                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                          JD
                        </AvatarFallback>
                      </Avatar>
                      <div className="relative flex-1">
                        <Input
                          placeholder="Type a reply / comment"
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
                      <h3 className="text-sm font-semibold">Activity</h3>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                        <Plus className="size-3.5 mr-1" /> New Email
                      </Button>
                    </div>

                    <Timeline>
                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> changed the value of Username from <span className="font-medium">john</span> to <span className="font-medium">johndoe</span> ·{" "}
                            <TimelineTime>1 year ago</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> last edited this ·{" "}
                            <TimelineTime>1 year ago</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> added rows for Social Logins ·{" "}
                            <TimelineTime>1 year ago</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> removed rows for Social Logins ·{" "}
                            <TimelineTime>1 year ago</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>
                    </Timeline>
                  </div>
                </div>

                <div className="w-full lg:w-72 border-l p-4 space-y-6 text-xs bg-muted/10">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-foreground">John Doe</h4>
                      <p className="text-muted-foreground text-xs font-mono">john.doe@demo.com</p>
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
                        Assign
                      </span>
                      <Plus className="size-3.5" />
                    </Button>

                    <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <Paperclip className="size-3.5" />
                        Attachments
                      </span>
                      <Plus className="size-3.5" />
                    </Button>

                    <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <Share2 className="size-3.5" />
                        Share
                      </span>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-3 text-muted-foreground text-[11px]">
                    <div>
                      <p className="font-medium text-foreground">Administrator</p>
                      <p>last edited this · 1 year ago</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Administrator</p>
                      <p>created this · 1 year ago</p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="settings" className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
                <div className="flex-1 p-6 space-y-6">
                  <div className="space-y-3">
                    <Collapsible open={yulaAiSettingsOpen} onOpenChange={setYulaAiSettingsOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>Yula AI & LLM Settings</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            yulaAiSettingsOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 space-y-4">
                        <p className="text-xs text-muted-foreground">
                          Yula AI'ın akıl yürütme motorunu ve model sağlayıcısını yapılandırın.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Field>
                            <FieldLabel className="text-xs text-muted-foreground">
                              AI Provider
                            </FieldLabel>
                            <Select
                              value={aiProvider}
                              onValueChange={(val: any) => handleProviderChange(val)}
                            >
                              <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                                <SelectValue placeholder="Select Provider" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ollama">Yerel Ollama (Gemma 4 / Llama 3 / Offline)</SelectItem>
                                <SelectItem value="google">Google AI SDK (Gemini 2.5 Flash / Pro)</SelectItem>
                                <SelectItem value="azure">Microsoft AI Foundry (Azure OpenAI / Phi-4)</SelectItem>
                                <SelectItem value="openai">OpenAI / Custom OpenAI-Compatible</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>

                          <Field>
                            <FieldLabel className="text-xs text-muted-foreground">
                              Model Name
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
                              API / Host Endpoint URL
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
                              API Key
                            </FieldLabel>
                            <div className="relative">
                              <Input
                                type={showApiKey ? "text" : "password"}
                                value={aiApiKey}
                                onChange={(e) => setAiApiKey(e.target.value)}
                                placeholder={aiProvider === "ollama" ? "Not required for local model" : "sk-..."}
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
                              Düşünme Derinliği (Thinking Level)
                            </FieldLabel>
                            <Select
                              value={aiThinkingLevel}
                              onValueChange={(val: NonNullable<AiProviderConfig["thinkingLevel"]>) =>
                                setAiThinkingLevel(val)
                              }
                            >
                              <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                                <SelectValue placeholder="Seviye seçin" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="off">Kapalı (En hızlı)</SelectItem>
                                <SelectItem value="low">Düşük</SelectItem>
                                <SelectItem value="medium">Orta</SelectItem>
                                <SelectItem value="high">Yüksek (En derin akıl yürütme)</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-muted-foreground">
                            Aktif: <strong className="text-foreground">{aiProvider.toUpperCase()}</strong> ({aiModel})
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSaveAiConfig}
                            className="h-7 px-3 text-xs gap-1.5"
                          >
                            {aiSaved ? (
                              <>
                                <Check className="size-3 text-emerald-300" />
                                Saved & Active
                              </>
                            ) : (
                              "Save AI Configuration"
                            )}
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={systemFactsOpen} onOpenChange={setSystemFactsOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>Yula Kalıcı Sistem Bilgileri (System Facts)</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            systemFactsOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Yula'nın her sohbette hatırlayacağı kalıcı bilgiler (örn: varsayılan depo, para birimi,
                          rapor tercihi). Kayıt kullanıcı onayınızla yapılır ve diskte saklanır; her task turunda
                          sistem bağlamına eklenir.
                        </p>

                        {Object.keys(systemFacts).length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Henüz kalıcı bilgi kaydedilmedi.</p>
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
                                    aria-label={`${k} bilgisini sil`}
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
                              placeholder="Anahtar (örn: varsayılan depo)"
                              className="bg-muted/30 border-muted-foreground/20 h-9 text-xs"
                            />
                          </div>
                          <Input
                            value={factValue}
                            onChange={(e) => setFactValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveSystemFact()
                            }}
                            placeholder="Değer (örn: MAIN)"
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
                                Kaydedildi
                              </>
                            ) : (
                              "Hatırla"
                            )}
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={changePasswordOpen} onOpenChange={setChangePasswordOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>Change Password</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            changePasswordOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground space-y-3">
                        <p>Old Password & New Password controls.</p>
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={documentFollowOpen} onOpenChange={setDocumentFollowOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>Document Follow</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            documentFollowOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                        Document follow notification preferences.
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={emailOpen} onOpenChange={setEmailOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>Email</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            emailOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                        Email notification settings.
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={workspaceOpen} onOpenChange={setWorkspaceOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>Workspace</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            workspaceOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                        Workspace display preferences.
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={appOpen} onOpenChange={setAppOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>App</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            appOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                        App UI settings.
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={thirdPartyAuthOpen} onOpenChange={setThirdPartyAuthOpen} className="border-b pb-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                        <span>Third Party Authentication</span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            thirdPartyAuthOpen ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4 space-y-3">
                        <h4 className="text-xs font-medium text-muted-foreground">Social Logins</h4>
                        
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
                                <TableCell className="font-medium text-foreground">frappe</TableCell>
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
                    <h3 className="text-sm font-semibold">Comments</h3>

                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                          JD
                        </AvatarFallback>
                      </Avatar>
                      <div className="relative flex-1">
                        <Input
                          placeholder="Type a reply / comment"
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
                      <h3 className="text-sm font-semibold">Activity</h3>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                        <Plus className="size-3.5 mr-1" /> New Email
                      </Button>
                    </div>

                    <Timeline>
                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> changed the value of Username from <span className="font-medium">john</span> to <span className="font-medium">johndoe</span> ·{" "}
                            <TimelineTime>1 year ago</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> last edited this ·{" "}
                            <TimelineTime>1 year ago</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> added rows for Social Logins ·{" "}
                            <TimelineTime>1 year ago</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>

                      <TimelineItem>
                        <TimelineDot />
                        <TimelineContent>
                          <TimelineTitle>
                            <span className="font-medium">Administrator</span> removed rows for Social Logins ·{" "}
                            <TimelineTime>1 year ago</TimelineTime>
                          </TimelineTitle>
                        </TimelineContent>
                      </TimelineItem>
                    </Timeline>
                  </div>
                </div>

                <div className="w-full lg:w-72 border-l p-4 space-y-6 text-xs bg-muted/10">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-foreground">John Doe</h4>
                      <p className="text-muted-foreground text-xs font-mono">john.doe@demo.com</p>
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
                        Assign
                      </span>
                      <Plus className="size-3.5" />
                    </Button>

                    <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <Paperclip className="size-3.5" />
                        Attachments
                      </span>
                      <Plus className="size-3.5" />
                    </Button>

                    <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <Share2 className="size-3.5" />
                        Share
                      </span>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-3 text-muted-foreground text-[11px]">
                    <div>
                      <p className="font-medium text-foreground">Administrator</p>
                      <p>last edited this · 1 year ago</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Administrator</p>
                      <p>created this · 1 year ago</p>
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="connections" className="p-6 m-0 text-xs text-muted-foreground">
                Connected Social Logins & Roles
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </WorkspaceAiDock>
    </div>
  )
}
