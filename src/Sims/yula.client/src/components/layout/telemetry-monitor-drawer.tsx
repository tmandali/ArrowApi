"use client";

import * as React from "react";
import {
  uiEventBus,
  TelemetryTopic,
  TelemetrySeverity,
  UIEvent,
  TELEMETRY_TOPICS,
} from "@my-agent/core";
import {
  Activity,
  X,
  Trash2,
  Copy,
  Check,
  Search,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTelemetryMonitorStore } from "@/lib/stores/telemetry-monitor";

const TOPIC_COLORS: Record<TelemetryTopic, { badge: string; text: string }> = {
  jobs: { badge: "bg-blue-500/10 border-blue-500/30 text-blue-500", text: "text-blue-500" },
  data: { badge: "bg-purple-500/10 border-purple-500/30 text-purple-500", text: "text-purple-500" },
  form: { badge: "bg-amber-500/10 border-amber-500/30 text-amber-500", text: "text-amber-500" },
  navigation: { badge: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500", text: "text-emerald-500" },
  system: { badge: "bg-zinc-500/10 border-zinc-500/30 text-zinc-400", text: "text-zinc-400" },
};

export function TelemetryMonitorDrawer() {
  const { isOpen, close } = useTelemetryMonitorStore();
  const [events, setEvents] = React.useState<UIEvent[]>(() => uiEventBus.getRecentEvents({ limit: 50 }));
  const [selectedTopic, setSelectedTopic] = React.useState<TelemetryTopic | "all">("all");
  const [selectedSeverity, setSelectedSeverity] = React.useState<TelemetrySeverity | "all">("all");
  const [searchCorrelation, setSearchCorrelation] = React.useState("");
  const [expandedIndices, setExpandedIndices] = React.useState<Record<number, boolean>>({});
  const [copied, setCopied] = React.useState(false);

  // Canlı telemetri olaylarını ve göreli zaman akışını dinle
  React.useEffect(() => {
    const refresh = () => setEvents(uiEventBus.getRecentEvents({ limit: 50 }));
    const unsub = uiEventBus.onTelemetry(() => refresh());
    const interval = setInterval(refresh, 2500);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  if (!isOpen) return null;

  const filteredEvents = events.filter((ev) => {
    if (selectedTopic !== "all" && ev.topic !== selectedTopic) return false;
    if (selectedSeverity !== "all" && (ev.severity ?? "info") !== selectedSeverity) return false;
    if (searchCorrelation && !ev.correlationId?.toLowerCase().includes(searchCorrelation.toLowerCase())) return false;
    return true;
  });

  const topicCounts = events.reduce((acc, ev) => {
    const t = ev.topic ?? "system";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleCopyJson = () => {
    void navigator.clipboard.writeText(JSON.stringify(filteredEvents, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    uiEventBus.clearTelemetry();
    setEvents([]);
  };

  const toggleExpand = (idx: number) => {
    setExpandedIndices((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-primary animate-pulse" />
            <span className="font-semibold text-sm">Canlı Telemetri Monitörü</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-mono text-primary font-medium">
              {events.length} olay
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={handleClear} title="Telemetriyi Temizle">
              <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={close} title="Kapat">
              <X className="size-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="border-b border-border bg-muted/30 p-3 space-y-2">
          {/* Topic Pills */}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedTopic("all")}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                selectedTopic === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Tümü ({events.length})
            </button>
            {(Object.keys(TELEMETRY_TOPICS) as TelemetryTopic[]).map((topic) => (
              <button
                key={topic}
                onClick={() => setSelectedTopic(topic)}
                className={`rounded px-2 py-1 text-xs font-medium border transition-colors ${
                  selectedTopic === topic
                    ? "bg-foreground text-background font-semibold"
                    : `${TOPIC_COLORS[topic].badge} hover:opacity-80`
                }`}
              >
                {topic} ({topicCounts[topic] || 0})
              </button>
            ))}
          </div>

          {/* Search & Severity Row */}
          <div className="flex items-center gap-2 pt-1">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="correlationId / jobId ara..."
                value={searchCorrelation}
                onChange={(e) => setSearchCorrelation(e.target.value)}
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value as TelemetrySeverity | "all")}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">Tüm Önem Düzeyleri</option>
              <option value="info">Bilgi (info)</option>
              <option value="warn">Uyarı (warn)</option>
              <option value="critical">Kritik (critical)</option>
            </select>
          </div>
        </div>

        {/* Event List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredEvents.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-muted-foreground">
              <Activity className="size-8 stroke-1 text-muted-foreground/50 mb-2" />
              Kayıtlı telemetri olayı bulunamadı.
            </div>
          ) : (
            filteredEvents
              .slice()
              .reverse()
              .map((ev, idx) => {
                const topic = ev.topic ?? "system";
                const isExpanded = expandedIndices[idx] ?? false;
                const isCritical = ev.severity === "critical";
                const isWarn = ev.severity === "warn";

                return (
                  <div
                    key={`${ev.timestamp}-${idx}`}
                    className={`rounded-lg border text-xs transition-all ${
                      isCritical
                        ? "border-destructive/40 bg-destructive/5"
                        : isWarn
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-border bg-background hover:border-muted-foreground/30"
                    }`}
                  >
                    <div
                      onClick={() => toggleExpand(idx)}
                      className="flex items-center justify-between p-2.5 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded ? <ChevronDown className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase ${TOPIC_COLORS[topic].badge}`}>
                          {topic}
                        </span>
                        <span className="font-semibold truncate text-foreground">{ev.type}</span>
                        {isCritical && (
                          <span className="flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                            <AlertCircle className="size-3" /> kritik
                          </span>
                        )}
                        {isWarn && (
                          <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                            <AlertTriangle className="size-3" /> uyarı
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] font-mono text-muted-foreground">{ev.age ?? "just now"}</span>
                    </div>

                    <div className="px-2.5 pb-2 text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span>kaynak: <code className="text-foreground">{ev.source}</code></span>
                      {ev.correlationId && (
                        <span>korelasyon: <code className="text-primary font-mono">{ev.correlationId}</code></span>
                      )}
                    </div>

                    {isExpanded && ev.payload && (
                      <div className="border-t border-border/50 bg-muted/40 p-2.5 rounded-b-lg">
                        <pre className="text-[11px] font-mono text-foreground/90 overflow-x-auto whitespace-pre-wrap max-h-48">
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5">
          <Button variant="outline" size="sm" onClick={handleCopyJson} className="gap-1.5 text-xs">
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            {copied ? "Kopyalandı" : "JSON Kopyala"}
          </Button>
          <Button variant="ghost" size="sm" onClick={close} className="text-xs">
            Kapat
          </Button>
        </div>
      </div>
    </div>
  );
}
