"use client";

import * as React from "react";
import {
  uiEventBus,
  type TelemetryTopic,
  type TelemetrySeverity,
  type UIEvent,
  TELEMETRY_TOPICS,
} from "@my-agent/core";
import {
  Activity,
  Trash2,
  Copy,
  Check,
  Search,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/utils/cn";

const TOPIC_STYLES: Record<TelemetryTopic, { text: string }> = {
  jobs: { text: "text-blue-500 dark:text-blue-400" },
  data: { text: "text-purple-500 dark:text-purple-400" },
  form: { text: "text-amber-500 dark:text-amber-400" },
  navigation: { text: "text-emerald-500 dark:text-emerald-400" },
  system: { text: "text-zinc-500 dark:text-zinc-400" },
};

const SEVERITY_DOTS: Record<TelemetrySeverity, string> = {
  critical: "bg-destructive ring-2 ring-destructive/20 animate-pulse",
  warn: "bg-amber-500 ring-2 ring-amber-500/20",
  info: "bg-muted-foreground/40",
};

export function TelemetryDetailView() {
  const [events, setEvents] = React.useState<UIEvent[]>(() =>
    uiEventBus.getRecentEvents({ limit: 50 }),
  );
  const [selectedTopic, setSelectedTopic] = React.useState<TelemetryTopic | "all">("all");
  const [selectedSeverity, setSelectedSeverity] = React.useState<TelemetrySeverity | "all">("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [expandedIndices, setExpandedIndices] = React.useState<Record<number, boolean>>({});
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const refresh = () => setEvents(uiEventBus.getRecentEvents({ limit: 50 }));
    const unsub = uiEventBus.onTelemetry(refresh);
    const interval = setInterval(refresh, 2500);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const topicCounts = React.useMemo(() => {
    return events.reduce((acc, ev) => {
      const t = ev.topic ?? "system";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [events]);

  const effectiveSelectedTopic =
    selectedTopic !== "all" && (topicCounts[selectedTopic] || 0) === 0
      ? "all"
      : selectedTopic;

  const filteredEvents = React.useMemo(() => {
    return events.filter((ev) => {
      if (effectiveSelectedTopic !== "all" && ev.topic !== effectiveSelectedTopic) return false;
      if (selectedSeverity !== "all" && (ev.severity ?? "info") !== selectedSeverity) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchCorr = ev.correlationId?.toLowerCase().includes(query);
        const matchType = ev.type?.toLowerCase().includes(query);
        const matchSrc = ev.source?.toLowerCase().includes(query);
        if (!matchCorr && !matchType && !matchSrc) return false;
      }
      return true;
    });
  }, [events, effectiveSelectedTopic, selectedSeverity, searchQuery]);

  const allExpanded =
    filteredEvents.length > 0 &&
    filteredEvents.every((_, idx) => expandedIndices[idx]);

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedIndices({});
    } else {
      const next: Record<number, boolean> = {};
      filteredEvents.forEach((_, idx) => {
        next[idx] = true;
      });
      setExpandedIndices(next);
    }
  };

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
    <div className="flex h-full w-full flex-col min-h-0 bg-background/50">
      {/* 1. Filter Toolbar */}
      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Olay, kaynak veya correlation ID ara..."
              className="h-8 pl-8 text-xs bg-muted/20 border-border/60"
            />
          </div>

          <Select
            value={selectedSeverity}
            onValueChange={(val) => setSelectedSeverity(val as TelemetrySeverity | "all")}
          >
            <SelectTrigger className="h-8 w-28 text-xs bg-muted/20 border-border/60">
              <SelectValue placeholder="Seviye" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Seviyeler</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Uyarı (Warn)</SelectItem>
              <SelectItem value="critical">Kritik (Critical)</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={toggleAll}
            title={allExpanded ? "Tümünü Daralt" : "Tümünü Genişlet"}
          >
            <ChevronsUpDown className="size-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={handleCopyJson}
            title="Filtrelenmiş JSON Kopyala"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-destructive cursor-pointer"
            onClick={handleClear}
            title="Telemetri Geçmişini Temizle"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {/* 2. Topic Filter Tabs (Sleek, dynamic & compact) */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
          {/* Tümü */}
          <button
            type="button"
            onClick={() => setSelectedTopic("all")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer shrink-0 select-none",
              effectiveSelectedTopic === "all"
                ? "bg-muted text-foreground font-semibold shadow-2xs"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <span>Tümü</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              ({events.length})
            </span>
          </button>

          {/* Active Topics (Only topics with count > 0) */}
          {(Object.keys(TELEMETRY_TOPICS) as TelemetryTopic[])
            .filter((topicKey) => (topicCounts[topicKey] || 0) > 0)
            .map((topicKey) => {
              const count = topicCounts[topicKey] || 0;
              const isActive = effectiveSelectedTopic === topicKey;

              return (
                <button
                  key={topicKey}
                  type="button"
                  onClick={() => setSelectedTopic(topicKey)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer shrink-0 select-none",
                    isActive
                      ? "bg-muted text-foreground font-semibold shadow-2xs"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full shrink-0",
                      topicKey === "jobs"
                        ? "bg-blue-500"
                        : topicKey === "data"
                        ? "bg-purple-500"
                        : topicKey === "form"
                        ? "bg-amber-500"
                        : topicKey === "navigation"
                        ? "bg-emerald-500"
                        : "bg-zinc-400",
                    )}
                  />
                  <span className="capitalize">{topicKey}</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    ({count})
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* 3. Event List Stream (MDX Log Stream) */}
      <ScrollArea className="flex-1 min-h-0">
        {filteredEvents.length === 0 ? (
          <Empty className="py-12">
            <EmptyMedia variant="icon">
              <Activity className="size-4" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-sm">Telemetri Olayı Yok</EmptyTitle>
              <EmptyDescription className="text-xs">
                Seçili filtre ölçütlerine uyan veya kaydedilmiş bir UI olay akışı bulunmuyor.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y divide-border/30">
            {filteredEvents.map((ev, idx) => {
              const isExpanded = Boolean(expandedIndices[idx]);
              const severity = ev.severity ?? "info";
              const topic = ev.topic ?? "system";
              const topicStyle = TOPIC_STYLES[topic] || TOPIC_STYLES.system;

              return (
                <Collapsible
                  key={`telemetry-${ev.timestamp}-${idx}`}
                  open={isExpanded}
                  onOpenChange={() => toggleExpand(idx)}
                  className={cn(
                    "group transition-colors",
                    isExpanded ? "bg-muted/15" : "hover:bg-muted/10",
                    severity === "critical" && "bg-destructive/5 hover:bg-destructive/10",
                  )}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left select-none cursor-pointer"
                    >
                      {/* Left: Indicator + Topic + Type + Source */}
                      <div className="flex min-w-0 items-center gap-2">
                        <ChevronRight
                          className={cn(
                            "size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                            isExpanded && "rotate-90 text-foreground",
                          )}
                        />

                        {/* Severity Dot */}
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            SEVERITY_DOTS[severity] || SEVERITY_DOTS.info,
                          )}
                          title={`Önem: ${severity}`}
                        />

                        {/* Topic Tag */}
                        <span
                          className={cn(
                            "font-mono text-[11px] font-medium tracking-tight shrink-0",
                            topicStyle.text,
                          )}
                        >
                          [{topic}]
                        </span>

                        {/* Event Type */}
                        <span className="font-mono text-xs font-semibold text-foreground truncate">
                          {ev.type}
                        </span>

                        {/* Inline Source annotation */}
                        {ev.source && (
                          <span className="hidden sm:inline text-[11px] text-muted-foreground/60 truncate">
                            — {ev.source}
                          </span>
                        )}
                      </div>

                      {/* Right: Correlation ID + Timestamp */}
                      <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-muted-foreground">
                        {ev.correlationId && (
                          <span
                            className="rounded bg-muted/40 px-1 py-0.2 text-[10px] text-muted-foreground/80 hover:text-foreground truncate max-w-[90px]"
                            title={`Correlation ID: ${ev.correlationId}`}
                          >
                            #{ev.correlationId.slice(-8)}
                          </span>
                        )}
                        <span className="tabular-nums text-[11px] text-muted-foreground/60">
                          {ev.age || "az önce"}
                        </span>
                      </div>
                    </button>
                  </CollapsibleTrigger>

                  {/* Expanded Detail (MDX Callout / Code Section) */}
                  <CollapsibleContent>
                    <div className="px-3 pb-3 pt-0.5 pl-8">
                      <div className="border-l-2 border-border/60 pl-3.5 py-1 space-y-2 text-xs">
                        {/* Metadata Header */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground/60">Zaman:</span>
                            <span className="text-foreground">
                              {new Date(ev.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground/60">Kaynak:</span>
                            <span className="text-foreground">{ev.source}</span>
                          </div>
                          {ev.correlationId && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground/60">Correlation:</span>
                              <span className="text-foreground select-all">{ev.correlationId}</span>
                            </div>
                          )}
                          {severity !== "info" && (
                            <Badge
                              variant={severity === "critical" ? "destructive" : "outline"}
                              className="h-4 px-1 text-[10px]"
                            >
                              {severity === "critical" ? "Kritik" : "Uyarı"}
                            </Badge>
                          )}
                        </div>

                        {/* JSON Payload */}
                        {ev.payload ? (
                          <div className="mt-1.5">
                            <CodeBlock
                              value={JSON.stringify(ev.payload, null, 2)}
                              language="json"
                              showCopyButton
                              className="text-xs bg-background/80 border border-border/40 rounded-md"
                            />
                          </div>
                        ) : (
                          <div className="text-[11px] text-muted-foreground/50 italic py-0.5">
                            Ek veri yükü (payload) bulunmuyor.
                          </div>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

