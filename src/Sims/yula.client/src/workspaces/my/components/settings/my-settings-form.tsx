"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { emitLocaleChange } from "@/lib/locale-events";
import { AIChatAssistant } from "@/components/layout/ai-chat/ai-chat-assistant";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { panelCardClass } from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { saveSecret } from "@/lib/secure-config";
import { cacheYulaClientAiConfigFromDb } from "@/lib/yula-ai-client-config";
import { putSettingsToApi } from "./settings-api";
import { syncLocaleCookie } from "./settings-utils";
import type { ProfileLanguage, SettingsTabId } from "./settings-types";
import { useSettingsFormState } from "./use-settings-form-state";
import { useSettingsBoot } from "./use-settings-boot";
import { useSystemFacts } from "./use-system-facts";
import { ProfileTab } from "./profile-tab";
import { AiTab } from "./ai-tab";
import { PreferencesTab } from "./preferences-tab";
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context";
import { useAgentComponent } from "@my-agent/react";

export function MySettingsForm() {
  const t = useTranslations("MySettings");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const form = useSettingsFormState();

  // Sekme derin bağlantısı: menüden `?tab=settings` (Tercihler) /
  // `?tab=user-details` (Profil) ile gelinir; sekme tıklaması da URL'yi
  // günceller (replace, scroll yok) — yenileme/derin bağlantı korunur.
  // Aynı sayfada menüden ikinci tıklamada remount olmadığı için param
  // değişimi state'e senkronlanır.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const isSettingsTab = (v: string | null): v is SettingsTabId =>
    v === "user-details" || v === "settings" || v === "yula-ai" || v === "connections";
  const [activeTab, setActiveTab] = React.useState<SettingsTabId>(
    isSettingsTab(tabParam) ? tabParam : "user-details",
  );
  React.useEffect(() => {
    // URL search-params (tab=...) ile state senkronu — legit external-sync.
    // eslint-disable-next-line set-state-in-effect
    if (isSettingsTab(tabParam)) setActiveTab(tabParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);
  const handleTabChange = (v: string) => {
    if (!isSettingsTab(v)) return;
    setActiveTab(v);
    router.replace(`${pathname}?tab=${v}`, { scroll: false });
  };

  const getSnapshot = React.useCallback(
    () => ({
      email: form.profileEmail.trim(),
      fullName:
        form.profileFullName.trim() ||
        `${form.profileFirstName} ${form.profileLastName}`.trim(),
      language: form.profileLanguage,
      timeZone: form.profileTimeZone,
      aiProvider: form.aiProvider,
      aiModel: form.aiModel,
      aiEndpoint: form.aiEndpoint,
      thinkingLevel: form.aiThinkingLevel,
    }),
    [
      form.profileEmail,
      form.profileFullName,
      form.profileFirstName,
      form.profileLastName,
      form.profileLanguage,
      form.profileTimeZone,
      form.aiProvider,
      form.aiModel,
      form.aiEndpoint,
      form.aiThinkingLevel,
    ]
  );
  const facts = useSystemFacts(getSnapshot);

  useSettingsBoot(form, facts.setSystemFacts);

  useScreenAgentContext({
    screenId: "my-settings",
    screenTitle: t("title"),
    workspaceId: "my",
    activeDataSummary: {
      isViewingResults: false,
      jobId: undefined,
    },
    quickPrompts: [
      t("prompt_save_settings"),
      t("prompt_change_store"),
    ],
    stateExtra: {
      activeTab,
      aiProvider: form.aiProvider,
      aiModel: form.aiModel,
      language: form.profileLanguage,
    },
  });

  useAgentComponent({
    id: "entity_form:user_settings",
    meta: {
      entity: "user_settings",
      screenTitle: t("title"),
      workspace: "my",
      activeTab,
      profile: {
        email: form.profileEmail,
        fullName: form.profileFullName || `${form.profileFirstName} ${form.profileLastName}`.trim(),
        language: form.profileLanguage,
        timeZone: form.profileTimeZone,
      },
      aiSettings: {
        provider: form.aiProvider,
        model: form.aiModel,
        endpoint: form.aiEndpoint,
        thinkingLevel: form.aiThinkingLevel,
      },
    },
    actions: {
      READ: {
        description: "Reads current user profile, preferences, and AI configuration.",
        whenToCall: "When inspecting user settings, AI provider, or profile parameters.",
        whenNotToCall: "When modifying values.",
      },
      SWITCH_TAB: {
        description: "Switches the active settings tab ({ tab: 'user-details' | 'settings' | 'yula-ai' | 'connections' }).",
        whenToCall: "When the user asks to open profile, preferences, or AI model settings.",
        whenNotToCall: "When the tab is already active.",
      },
      SET_AI_CONFIG: {
        description: "Updates AI provider, model, or thinking parameters ({ provider?: string, model?: string, thinkingLevel?: string }).",
        whenToCall: "When the user asks to change the active LLM model or AI provider.",
        whenNotToCall: "When updating profile info.",
      },
    },
    onAction: async (action, payload) => {
      if (action === "READ") {
        return {
          success: true,
          activeTab,
          profile: {
            email: form.profileEmail,
            fullName: form.profileFullName || `${form.profileFirstName} ${form.profileLastName}`.trim(),
            language: form.profileLanguage,
            timeZone: form.profileTimeZone,
          },
          aiSettings: {
            provider: form.aiProvider,
            model: form.aiModel,
            endpoint: form.aiEndpoint,
            thinkingLevel: form.aiThinkingLevel,
          },
        };
      }
      if (action === "SWITCH_TAB" && typeof payload?.tab === "string") {
        const targetTab = payload.tab as SettingsTabId;
        if (isSettingsTab(targetTab)) {
          handleTabChange(targetTab);
          return { success: true, activeTab: targetTab };
        }
        return { success: false, error: `Invalid tab: ${payload.tab}` };
      }
      if (action === "SET_AI_CONFIG" && payload) {
        if (typeof payload.provider === "string") form.setAiProvider(payload.provider as any);
        if (typeof payload.model === "string") form.setAiModel(payload.model);
        if (typeof payload.thinkingLevel === "string") form.setAiThinkingLevel(payload.thinkingLevel as any);
        return { success: true, message: "AI configuration updated on screen." };
      }
      return { success: false, error: `Unknown action: ${action}` };
    },
  });

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
    syncLocaleCookie(lang);
    const code = lang === "turkish" ? "tr" : "en";
    if (code === locale) return;
    emitLocaleChange(code);
    // `persisted` (PUT + secret) biter bitmez reload; takılırsa 3 sn üst sınırdan
    // sonra yine reload — in-flight abort yarışı oluşmaz, suzma bozulmaz.
    // (persisted zaten `.catch(() => undefined)` ile hiç reddetmez; cap reddetmez.
    //  `Promise.race` = ikisinin önceki çözüleni → "bitti YADA zaman doldu".)
    const cap = new Promise<void>((r) => window.setTimeout(r, 3000));
    void Promise.race([persisted ?? Promise.resolve(), cap]).then(() => {
      window.setTimeout(() => window.location.reload(), 150);
    });
  };

  /** Header Save butonu — DB'ye yazar, başarılıysa önbelleği DB'den aynalar.
   * Form localStorage'a doğrudan yazmaz; secret sessionStorage'da yaşar.
   * Bölüm içi ayrı kaydet butonu yok. */
  const handleSaveProfile = () => {
    if (form.profileEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.profileEmail.trim())) return;
    // AI snapshot — sohbet hattı önbellekten (`yula_ai_config`) okur.
    form.setAiConfigState({
      provider: form.aiProvider,
      model: form.aiModel,
      endpoint: form.aiEndpoint,
      apiKey: form.aiApiKey,
      thinkingLevel: form.aiThinkingLevel,
    });
    // Dil değiştiyse reload, kalıcılık tamamlanana dek bekler (abort yarışı yok).
    const secretP = saveSecret(form.aiApiKey).catch(() => undefined);
    const putP = putSettingsToApi({
      ...getSnapshot(),
      systemFacts: facts.systemFacts,
    })
      .then((row) => {
        // Yalnızca DB yazımı başarılıysa önbelleği aynala (tek yön: DB → cache).
        if (row) cacheYulaClientAiConfigFromDb(row);
      })
      .catch(() => undefined);
    applyLanguageChange(form.profileLanguage, Promise.all([secretP, putP]));
    form.setProfileSaved(true);
    setTimeout(() => form.setProfileSaved(false), 2500);
  };

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
            disabled={!form.profileLoaded}
          >
            {form.profileSaved ? tc("saved") : tc("save")}
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

          <TabsContent value="user-details" className="m-0 flex-1 flex flex-col overflow-hidden">
            <ProfileTab form={form} />
          </TabsContent>

          <TabsContent value="yula-ai" className="m-0 flex-1 flex flex-col overflow-hidden">
            <AiTab form={form} />
          </TabsContent>

          <TabsContent value="settings" className="m-0 flex-1 flex flex-col overflow-hidden">
            <PreferencesTab form={form} facts={facts} />
          </TabsContent>
          <TabsContent value="connections" className="p-6 m-0 text-xs text-muted-foreground">
            {t("connections_body")}
          </TabsContent>
        </Tabs>
      </div>
    </WorkspacePageShell>
  );
}
