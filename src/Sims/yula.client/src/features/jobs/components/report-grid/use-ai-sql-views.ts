"use client";

import * as React from "react";
import { useYulaGridStore } from "@/lib/stores/grid";
import type { AiSqlView } from "@/components/virtual-spreadsheet";
import {
  subscribeAiView,
  takePendingAiView,
} from "@/hooks/use-pinned-charts";

/**
 * AI SQL görünümleri: localStorage kalıcılığı + Yula pin akışı
 * (takePendingAiView / subscribeAiView) + CRUD handler'ları.
 */
export function useAiSqlViews(args: {
  reportScope?: string;
  title?: string;
  customQuerySql: string | null;
  customQueryTitle: string | null;
  t: (key: string) => string;
}) {
  const { reportScope, title, customQuerySql, customQueryTitle, t } = args;

  // Uygulama-içi görünüm isteği React içinden taşınır; URL temiz kalır.
  const [pendingAiViewId, setPendingAiViewId] = React.useState<string | null>(
    () => takePendingAiView(reportScope)?.viewId ?? null,
  );
  React.useEffect(() => {
    return subscribeAiView((request) => {
      const scope = reportScope;
      if (
        scope &&
        request.scope &&
        scope.trim().toLowerCase() !== request.scope.trim().toLowerCase()
      ) {
        return;
      }
      setPendingAiViewId(request.viewId);
    });
  }, [reportScope]);
  const requestedAiViewId = pendingAiViewId;

  const storageKey = React.useMemo(() => {
    if (reportScope) return `arrow_grid_${reportScope}`;
    if (title && title !== "Report Result") {
      return `arrow_grid_${title.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
    }
    return undefined;
  }, [reportScope, title]);

  // AI SQL Görünümleri Yönetimi
  const [aiViews, setAiViews] = React.useState<AiSqlView[]>([]);
  const [activeAiViewId, setActiveAiViewId] = React.useState<string | null>(null);

  // LocalStorage'dan AI görünümlerini yükle
  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(`${storageKey}_ai_views`);
      if (raw) {
        const parsed = JSON.parse(raw) as AiSqlView[];
        if (Array.isArray(parsed)) {
          // localStorage (harici sistem) → mount'ta state'e yazılır; bilinen örüntü.
          // eslint-disable-next-line react/set-state-in-effect
          setAiViews(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  React.useEffect(() => {
    if (!requestedAiViewId) return;
    const requestedView = aiViews.find((view) => view.id === requestedAiViewId);
    if (requestedView) {
      useYulaGridStore
        .getState()
        .setCustomQuerySql(requestedView.sql, requestedView.title);
    }
  }, [requestedAiViewId, aiViews]);

  // customQuerySql değiştiğinde kayıtlı görünümler içinde var mı kontrol et (oto-kayıt YAPMAZ)
  // activeAiViewId, store'daki customQuerySql + aiViews'tan (harici kaynak) senkronize edilir.
  /* eslint-disable react/set-state-in-effect */
  React.useEffect(() => {
    if (!customQuerySql) {
      setActiveAiViewId(null);
      return;
    }

    const existing = aiViews.find((v) => v.sql.trim() === customQuerySql.trim());
    if (existing) {
      setActiveAiViewId(existing.id);
    } else {
      setActiveAiViewId(null);
    }
  }, [customQuerySql, aiViews]);
  /* eslint-enable react/set-state-in-effect */

  // Kullanıcı "Kaydet" dediğinde aktif AI sorgusunu kalıcı görünümlere ekle
  const handleSaveCurrentAiView = React.useCallback(
    (saveTitle: string) => {
      if (!customQuerySql) return;

      const newView: AiSqlView = {
        id: `ai_${Date.now()}`,
        title: saveTitle || customQueryTitle || t("ai_view_default"),
        sql: customQuerySql,
        createdAt: Date.now(),
      };

      setAiViews((prev) => {
        const next = [...prev, newView];
        if (storageKey && typeof window !== "undefined") {
          try {
            localStorage.setItem(`${storageKey}_ai_views`, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        return next;
      });

      setActiveAiViewId(newView.id);
    },
    [customQuerySql, customQueryTitle, storageKey, t]
  );

  const handleSelectAiView = React.useCallback(
    (viewId: string | null) => {
      if (!viewId) {
        useYulaGridStore.getState().setCustomQuerySql(null, null);
        setActiveAiViewId(null);
        return;
      }
      const target = aiViews.find((v) => v.id === viewId);
      if (target) {
        useYulaGridStore.getState().setCustomQuerySql(target.sql, target.title);
        setActiveAiViewId(target.id);
      }
    },
    [aiViews]
  );

  const handleRenameAiView = React.useCallback(
    (viewId: string, nextTitle: string) => {
      setAiViews((prev) => {
        const next = prev.map((v) =>
          v.id === viewId ? { ...v, title: nextTitle } : v
        );
        if (storageKey && typeof window !== "undefined") {
          try {
            localStorage.setItem(`${storageKey}_ai_views`, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        return next;
      });

      if (activeAiViewId === viewId && customQuerySql) {
        useYulaGridStore.getState().setCustomQuerySql(customQuerySql, nextTitle);
      }
    },
    [activeAiViewId, customQuerySql, storageKey]
  );

  const handleDeleteAiView = React.useCallback(
    (viewId: string) => {
      setAiViews((prev) => {
        const next = prev.filter((v) => v.id !== viewId);
        if (storageKey && typeof window !== "undefined") {
          try {
            localStorage.setItem(`${storageKey}_ai_views`, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        return next;
      });

      if (activeAiViewId === viewId) {
        useYulaGridStore.getState().setCustomQuerySql(null, null);
        setActiveAiViewId(null);
      }
    },
    [activeAiViewId, storageKey]
  );

  return {
    aiViews,
    activeAiViewId,
    storageKey,
    handleSaveCurrentAiView,
    handleSelectAiView,
    handleRenameAiView,
    handleDeleteAiView,
  };
}
