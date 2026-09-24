"use client";

import * as React from "react";
import { Search, Copy, Check } from "lucide-react";

interface ClaimsTableProps {
  claims: Record<string, unknown>;
  title: string;
}

export function IdentityClaimsTable({ claims, title }: ClaimsTableProps) {
  const [filter, setFilter] = React.useState("");
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const entries = React.useMemo(() => {
    return Object.entries(claims).filter(([key, val]) => {
      if (!filter) return true;
      const lower = filter.toLowerCase();
      return (
        key.toLowerCase().includes(lower) ||
        JSON.stringify(val).toLowerCase().includes(lower)
      );
    });
  }, [claims, filter]);

  const copyValue = (key: string, val: unknown) => {
    const text = typeof val === "object" ? JSON.stringify(val, null, 2) : String(val);
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const formatTimestamp = (val: unknown) => {
    if (typeof val === "number" && val > 1_000_000_000 && val < 2_500_000_000) {
      const date = new Date(val * 1000);
      return `${val} (${date.toLocaleString()})`;
    }
    return null;
  };

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{title}</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {Object.keys(claims).length} Claim
          </span>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Claim ara (key veya değer)..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-muted/20 text-muted-foreground">
            <tr>
              <th className="py-2.5 px-4 font-semibold w-1/4">Claim (Key)</th>
              <th className="py-2.5 px-4 font-semibold w-1/6">Tip</th>
              <th className="py-2.5 px-4 font-semibold">Değer</th>
              <th className="py-2.5 px-3 text-right w-16">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  Filtreye uygun claim bulunamadı.
                </td>
              </tr>
            ) : (
              entries.map(([key, val]) => {
                const tsFriendly = (key === "exp" || key === "iat" || key === "auth_time")
                  ? formatTimestamp(val)
                  : null;
                const isObject = typeof val === "object" && val !== null;
                const displayVal = tsFriendly ?? (isObject ? JSON.stringify(val) : String(val ?? ""));

                return (
                  <tr key={key} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-4 font-mono font-medium text-foreground">
                      {key}
                    </td>
                    <td className="py-2 px-4 text-muted-foreground font-mono">
                      {Array.isArray(val) ? "array" : typeof val}
                    </td>
                    <td className="py-2 px-4 font-mono text-muted-foreground break-all">
                      {isObject ? (
                        <pre className="max-h-24 overflow-y-auto rounded bg-muted/60 p-1.5 text-[11px]">
                          {JSON.stringify(val, null, 2)}
                        </pre>
                      ) : (
                        <span>{displayVal}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => copyValue(key, val)}
                        title="Değeri Kopyala"
                        className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {copiedKey === key ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
