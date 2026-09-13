"use client";

import * as React from "react";
import { loadSecret } from "@/lib/secure-config";
import { cacheYulaClientAiConfigFromDb } from "@/lib/yula-ai-client-config";
import { SETTINGS_API_URL, loadStoredAiConfig } from "./settings-api";
import type { SettingsApiRow } from "./settings-types";
import {
  mapLanguageToUi,
  mapTimeZoneToUi,
  normalizeApiProvider,
  normalizeThinking,
  splitFullName,
} from "./settings-utils";
import type { SettingsFormState } from "./use-settings-form-state";

type SettingsUserRow = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  language?: string | null;
  createdAt?: string | null;
};

/**
 * Açılış yükü: güvenli depodaki API anahtarı + DB settings satırı.
 * Önbellek yalnızca anlık ilk değer içindir; DB gelince form + önbellek
 * DB'den beslenir.
 */
export function useSettingsBoot(
  form: SettingsFormState,
  setSystemFacts: (facts: Record<string, string>) => void
) {
  const formRef = React.useRef(form);
  const factsRef = React.useRef(setSystemFacts);
  React.useEffect(() => {
    formRef.current = form;
    factsRef.current = setSystemFacts;
  });

  React.useEffect(() => {
    let active = true;
    const f = () => formRef.current;
    // Kayıtlı AI config'i hydration SONRASI yükle (ilk render varsayılan).
    // localStorage + secret-store senkronu — legit external-sync.
    // eslint-disable-next-line set-state-in-effect
    f().setAiConfigState(loadStoredAiConfig());
    loadSecret().then((secret) => {
      if (!active) return;
      f().setAiApiKey(secret || "");
      f().setAiConfigState((prev) => ({ ...prev, apiKey: secret || "" }));
      f().setConfigHydrated(true);
    });
    const loadSettings = (attempt: number) => {
      fetch(SETTINGS_API_URL, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { settings?: SettingsApiRow | null; user?: SettingsUserRow | null } | null) => {
          if (!active) return;
          const g = formRef.current;
          const row = data?.settings;
          const user = data?.user;
          if (row) {
            // DB → önbellek aynası (sohbet sıcak yolu + offline buradan beslenir).
            cacheYulaClientAiConfigFromDb(row);
            const provider = normalizeApiProvider(row.aiProvider);
            const thinking = normalizeThinking(row.thinkingLevel);
            g.setAiConfigState((prev) => ({
              ...prev,
              provider: provider ?? prev.provider,
              model: typeof row.aiModel === "string" && row.aiModel ? row.aiModel : prev.model,
              endpoint: typeof row.aiEndpoint === "string" ? row.aiEndpoint : prev.endpoint,
              thinkingLevel: row.thinkingLevel != null ? thinking : prev.thinkingLevel,
            }));
            if (row.systemFacts && typeof row.systemFacts === "object") {
              factsRef.current(row.systemFacts);
            }
            // Profil alanları — API'de kayıt varsa formu doldur (yoksa demo değerler kalır).
            if (typeof row.email === "string" && row.email) g.setProfileEmail(row.email);
            if (typeof row.fullName === "string" && row.fullName) {
              g.setProfileFullName(row.fullName);
              const split = splitFullName(row.fullName);
              g.setProfileFirstName(split.first || "");
              g.setProfileLastName(split.last || "");
            }
            const lang = mapLanguageToUi(row.language);
            if (lang) g.setProfileLanguage(lang);
            const tz = mapTimeZoneToUi(row.timeZone);
            if (tz) g.setProfileTimeZone(tz);
          }
          // Kullanıcının KENDİ kaydı (user_identities) — settings satırı henüz yoksa bile
          // ad/e-posta kendi hesabından gelir (ilk girişte demo değerler KALMAZ).
          // Dil: ayar satırı yoksa identity'nin ilk kayıt snapshot'ı tohumlamayı yapar
          // (Accept-Language'dan — Settings'i hiç açmamış kullanıcıya da tutarlı dil).
          const identityLang = user && !row ? mapLanguageToUi(user.language) : undefined;
          if (identityLang) g.setProfileLanguage(identityLang);
          const ownEmail =
            (typeof row?.email === "string" && row.email) ||
            (typeof user?.email === "string" && user.email);
          const ownName =
            (typeof row?.fullName === "string" && row.fullName) ||
            (typeof user?.name === "string" && user.name);
          if (ownEmail) {
            g.setProfileEmail(ownEmail);
            // Username kayıtlı değil → hesap e-postasının local kısmından türetilir.
            const localPart = ownEmail.split("@")[0]?.trim();
            if (localPart) g.setProfileUsername(localPart);
          }
          if (ownName) {
            g.setProfileFullName(ownName);
            const split = splitFullName(ownName);
            if (split.first) g.setProfileFirstName(split.first);
            if (split.last) g.setProfileLastName(split.last);
          }
          // Aktivite timeline + kenar panel — GERÇEK DB kayıtları (mock yok).
          g.setMeta({
            identityCreatedAt: user?.createdAt ?? null,
            settingsUpdatedAt: row?.updatedAt ?? null,
          });
          // GET tamamlandı — Save artık güvenli. İlk ziyaret yarışında
          // (guard'ın `ensure-user` POST'u bu GET'ten önce bitmediyse
          // identity satırı henüz yok → settings/user ikisi de null)
          // 1 sn sonra tek retry; ikinci denemede kayıt yoksa bile yüklenmiş sayılır.
          if (attempt > 0) {
            g.setProfileLoaded(true);
          } else {
            const empty = !data || (!data.settings && !data.user);
            if (empty) setTimeout(() => loadSettings(1), 1000);
            else g.setProfileLoaded(true);
          }
        })
        .catch(() => {
          // offline — localStorage fallback
          if (active) formRef.current.setProfileLoaded(true);
        });
    };
    loadSettings(0);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
