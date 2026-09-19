"use client";

import * as React from "react";

export type JobOwnerInfo = {
  name: string | null;
  email: string | null;
};

/**
 * `ownerId` (OIDC sub) setini isim/email olarak çözer.
 * Bir kez fetch edilir, modül-seviyesi in-memory cache tutulur
 * (sayfa geçişlerinde tekrar fetch edilmez, 5 dk TTL).
 */
const ownerCache = new Map<string, JobOwnerInfo>();
const OWNER_CACHE_TTL_MS = 5 * 60 * 1000;
let lastFetchAt = 0;
let pendingPromise: Promise<Map<string, JobOwnerInfo>> | null = null;

async function fetchOwners(
  ownerIds: string[],
): Promise<Map<string, JobOwnerInfo>> {
  if (pendingPromise && Date.now() - lastFetchAt < OWNER_CACHE_TTL_MS) {
    return pendingPromise;
  }

  pendingPromise = (async () => {
    const res = await fetch(
      `/api/jobs/owners?ids=${encodeURIComponent(ownerIds.join(","))}`,
      { cache: "no-store" },
    );
    if (!res.ok) return new Map<string, JobOwnerInfo>();
    const data = (await res.json()) as {
      owners: Record<string, { name: string | null; email: string | null }>;
    };
    const map = new Map<string, JobOwnerInfo>();
    for (const [id, info] of Object.entries(data.owners ?? {})) {
      map.set(id, { name: info.name, email: info.email });
    }
    return map;
  })();

  lastFetchAt = Date.now();
  try {
    const result = await pendingPromise;
    result.forEach((info, id) => ownerCache.set(id, info));
    return result;
  } finally {
    pendingPromise = null;
  }
}

export type JobOwnerKind = "mine" | "other" | "system";

/**
 * Detay panelinde "kim başlattı?" satırını doldurur — her zaman gösterilir:
 * - `ownerId == myOwnerId` → "Sen" / session adı (kind: "mine")
 * - `ownerId` başka        → name → email → sub fallback (kind: "other")
 * - `ownerId == null`       → "Sistem" (kind: "system")
 *
 * `myOwnerId` verilmezse (oturum yok / dev fallback) her dolu `ownerId`
 * "other" olarak çözülür, null → "system".
 */
export function useJobOwner(
  ownerId: string | null | undefined,
  myOwnerId?: string | null,
  myOwnerName?: string | null,
) {
  const [info, setInfo] = React.useState<JobOwnerInfo | null>(null);

  const isSystem = !ownerId;
  const isMine = Boolean(ownerId) && myOwnerId != null && ownerId === myOwnerId;

  React.useEffect(() => {
    // Kendi job'ında veya sistem job'ında dışa fetch gerekmez.
    if (!ownerId || isMine || isSystem) {
      // eslint-disable-next-line react/set-state-in-effect -- owner değişiminde cache/fetch senkronu; cancellation guard'lı, loop yok
      setInfo(null);
      return;
    }

    // Cache'ten senkron doldur
    const cached = ownerCache.get(ownerId);
    if (cached) {
      setInfo(cached);
      return;
    }

    let cancelled = false;
    // Henüz cache'te olmayanları fetch et
    const toFetch = [ownerId].filter((id) => !ownerCache.has(id));
    void fetchOwners(toFetch).then((map) => {
      if (cancelled) return;
      setInfo(map.get(ownerId) ?? { name: null, email: null });
    });

    return () => {
      cancelled = true;
    };
  }, [ownerId, isMine, isSystem]);

  const label: string = isSystem
    ? "Sistem"
    : isMine
      ? myOwnerName || "Sen"
      : info?.name ??
        info?.email ??
        (ownerId ? `${ownerId.slice(0, 8)}…` : "Sistem");

  const kind: JobOwnerKind = isSystem ? "system" : isMine ? "mine" : "other";

  return {
    label,
    kind,
    email: info?.email ?? null,
  };
}
