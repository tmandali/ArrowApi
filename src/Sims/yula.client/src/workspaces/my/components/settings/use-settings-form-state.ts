"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import {
  DEFAULT_AI_CONFIG,
  type AiProviderConfig,
  type ProfileLanguage,
  type ProfileTimeZone,
  type SettingsMeta,
} from "./settings-types";

/**
 * Ayar formu durumu: AI config + profil + meta. Güvenli-depo/API senkronu
 * render sırasında türevle yapılır (effect'siz — orijinal desen).
 */
export function useSettingsFormState() {
  const locale = useLocale();

  // Hydration güvenliği: ilk render her zaman DEFAULT_AI_CONFIG ile olur
  // (sunucuyla birebir); kayıtlı config mount effect'inde yüklenir.
  const [aiConfig, setAiConfigState] = React.useState<AiProviderConfig>(DEFAULT_AI_CONFIG);
  const [configHydrated, setConfigHydrated] = React.useState(false);

  const [aiProvider, setAiProvider] = React.useState<AiProviderConfig["provider"]>(aiConfig.provider);
  const [aiModel, setAiModel] = React.useState(aiConfig.model);
  const [aiEndpoint, setAiEndpoint] = React.useState(aiConfig.endpoint || "");
  const [aiApiKey, setAiApiKey] = React.useState(aiConfig.apiKey || "");
  const [aiThinkingLevel, setAiThinkingLevel] =
    React.useState<NonNullable<AiProviderConfig["thinkingLevel"]>>(aiConfig.thinkingLevel || "low");
  const [showApiKey, setShowApiKey] = React.useState(false);

  // User Details sekmesi — API'ye bağlı profil alanları. Başlangıç BOŞ:
  // demo/sahici sabit değer yok; form yalnızca (1) kayıtlı settings satırı,
  // (2) kullanıcının kendi login kimliği (user_identities), (3) locale
  // varsayılanlarından beslenir. Fetch başarısızsa alanlar boş kalır.
  const [profileEmail, setProfileEmail] = React.useState("");
  const [profileFullName, setProfileFullName] = React.useState("");
  const [profileFirstName, setProfileFirstName] = React.useState("");
  const [profileLastName, setProfileLastName] = React.useState("");
  const [profileUsername, setProfileUsername] = React.useState("");
  // Dil varsayılmanı EKRANIN (locale) dili olsun — kayıt/ilk açılışta form
  // ile ekran uyumsuz kalmasın (eskiden hardcoded "english": ekran Türkçe
  // iken form İngilizce gösterip Save ile DB'ye "english" yazıyordu).
  // Hydration güvenli: `locale` RSC context'ten gelir (server/client aynı).
  const [profileLanguage, setProfileLanguage] = React.useState<ProfileLanguage>(
    locale === "tr" ? "turkish" : "english",
  );
  // Zaman dilimi varsayılanı da locale ile hizalı (demo "asia-kolkata" değil):
  // tr → Europe/Istanbul, en → Asia/Kolkata. Kayıtlı değer API'den gelince
  // formu ezer — bu yalnız ilk açılış/boş kayıt için.
  const [profileTimeZone, setProfileTimeZone] = React.useState<ProfileTimeZone>(
    locale === "tr" ? "europe-istanbul" : "asia-kolkata",
  );
  const [profileSaved, setProfileSaved] = React.useState(false);
  const [profileLoaded, setProfileLoaded] = React.useState(false);

  // Aktivite/kenar panel — mock/demo satırlar KALDIRILDI; yalnız DB'den
  // gelen GERÇEK kayıtlar gösterilir (identity oluşum + ayarlar güncelleme).
  const [meta, setMeta] = React.useState<SettingsMeta>(null);

  // Güvenli depodan API anahtarı yüklendiğinde / config değiştiğinde formu
  // senkronla — render sırasında state ayarlama (effect'siz türev).
  const [syncedAiConfig, setSyncedAiConfig] = React.useState<AiProviderConfig | null>(null);
  const [syncedHydrated, setSyncedHydrated] = React.useState(false);
  if (syncedAiConfig !== aiConfig || syncedHydrated !== configHydrated) {
    setSyncedAiConfig(aiConfig);
    setSyncedHydrated(configHydrated);
    if (configHydrated) {
      setAiProvider(aiConfig.provider);
      setAiModel(aiConfig.model);
      setAiEndpoint(aiConfig.endpoint || "");
      setAiApiKey(aiConfig.apiKey || "");
      setAiThinkingLevel(aiConfig.thinkingLevel || "low");
    }
  }

  return {
    aiConfig,
    setAiConfigState,
    configHydrated,
    setConfigHydrated,
    aiProvider,
    setAiProvider,
    aiModel,
    setAiModel,
    aiEndpoint,
    setAiEndpoint,
    aiApiKey,
    setAiApiKey,
    aiThinkingLevel,
    setAiThinkingLevel,
    showApiKey,
    setShowApiKey,
    profileEmail,
    setProfileEmail,
    profileFullName,
    setProfileFullName,
    profileFirstName,
    setProfileFirstName,
    profileLastName,
    setProfileLastName,
    profileUsername,
    setProfileUsername,
    profileLanguage,
    setProfileLanguage,
    profileTimeZone,
    setProfileTimeZone,
    profileSaved,
    setProfileSaved,
    profileLoaded,
    setProfileLoaded,
    meta,
    setMeta,
  };
}

export type SettingsFormState = ReturnType<typeof useSettingsFormState>;
