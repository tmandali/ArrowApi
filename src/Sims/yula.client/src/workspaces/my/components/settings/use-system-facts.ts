"use client";

import * as React from "react";
import { putSettingsToApi, type SettingsSnapshot } from "./settings-api";

/**
 * System facts: anahtar/değer çiftleri + DB kalıcılığı.
 * Snapshot (profil + AI + dil/tz) glue'dan `getSnapshot` ile gelir.
 */
export function useSystemFacts(getSnapshot: () => Omit<SettingsSnapshot, "systemFacts">) {
  const [systemFacts, setSystemFacts] = React.useState<Record<string, string>>({});
  const [factKey, setFactKey] = React.useState("");
  const [factValue, setFactValue] = React.useState("");
  const [factSaved, setFactSaved] = React.useState(false);
  const snapshotRef = React.useRef(getSnapshot);
  React.useEffect(() => {
    snapshotRef.current = getSnapshot;
  });

  const handleSaveSystemFact = () => {
    const k = factKey.trim();
    const v = factValue.trim();
    if (!k || !v) return;
    const next = { ...systemFacts, [k]: v };
    setSystemFacts(next);
    void putSettingsToApi({ ...snapshotRef.current(), systemFacts: next });
    setFactKey("");
    setFactValue("");
    setFactSaved(true);
    setTimeout(() => setFactSaved(false), 2500);
  };

  const handleDeleteSystemFact = (key: string) => {
    const k = key.trim();
    if (!k) return;
    const next = { ...systemFacts };
    delete next[k];
    setSystemFacts(next);
    void putSettingsToApi({ ...snapshotRef.current(), systemFacts: next });
  };

  return {
    systemFacts,
    setSystemFacts,
    factKey,
    setFactKey,
    factValue,
    setFactValue,
    factSaved,
    handleSaveSystemFact,
    handleDeleteSystemFact,
  };
}

export type SystemFactsApi = ReturnType<typeof useSystemFacts>;
