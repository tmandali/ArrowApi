"use client";

import * as React from "react";
import { Check, ChevronDown, Brain, Eye, Wrench, Volume2, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useYulaChat } from "@/hooks/use-yula-chat";
import { cn } from "@/utils/cn";

export interface ModelOption {
  id: string;
  name: string;
  tag?: string;
  description?: string;
  hasThinking?: boolean;
  hasVision?: boolean;
  hasTools?: boolean;
  hasAudio?: boolean;
  isMlx?: boolean;
}

/** Bilinen modeller için görünüm ve etiket sözlüğü (yalnızca sistemde yüklü ise kullanılır) */
const MODEL_METADATA_MAP: Record<string, { name: string; tag?: string; description?: string; hasThinking?: boolean }> = {
  "gemma4:12b-mlx": {
    name: "Gemma 4 12B MLX",
    tag: "Fast MLX",
    description: "Apple Silicon MLX hızlandırılmış yerel Ollama modeli",
    hasThinking: true,
  },
  "gemma4:27b-mlx": {
    name: "Gemma 4 27B MLX",
    tag: "Medium MLX",
    description: "Dengeli MLX akıl yürütme ve raporlama modeli",
    hasThinking: true,
  },
  "gemma4-mlx": {
    name: "Gemma 4 MLX",
    tag: "MLX",
    description: "Yerel Gemma 4 MLX modeli",
    hasThinking: true,
  },
  "llama3.3:70b": {
    name: "Llama 3.3 (70B)",
    tag: "Pro",
    description: "Yüksek kapasiteli akıl yürütme",
    hasThinking: true,
  },
  "qwen2.5:32b": {
    name: "Qwen 2.5 (32B)",
    tag: "Medium",
    description: "Güçlü SQL ve kod yeteneği",
    hasThinking: true,
  },
  "deepseek-r1:14b": {
    name: "DeepSeek R1 (14B)",
    tag: "Thinking",
    description: "Derin düşünce adımları",
    hasThinking: true,
  },
  "gemini-3.6-flash": {
    name: "Gemini 3.6 Flash",
    tag: "Medium",
    description: "Hızlı bulut modeli",
    hasThinking: false,
  },
};

function formatModelOption(id: string): ModelOption {
  const cleanId = id.trim().toLowerCase();
  const metaKey = Object.keys(MODEL_METADATA_MAP).find(
    (k) => cleanId === k || cleanId.startsWith(k) || k.startsWith(cleanId) || cleanId.includes(k.split(":")[0])
  );
  const meta = metaKey ? MODEL_METADATA_MAP[metaKey] : undefined;
  const isMlx = cleanId.includes("mlx");
  const isGemma4 = cleanId.includes("gemma4") || cleanId.includes("gemma-4");

  const isThinkingModel =
    isGemma4 ||
    cleanId.includes("deepseek") ||
    cleanId.includes("r1") ||
    cleanId.includes("think") ||
    cleanId.includes("reason") ||
    cleanId.includes("qwen") ||
    cleanId.includes("llama");

  const hasVision =
    isGemma4 ||
    cleanId.includes("vision") ||
    cleanId.includes("llava") ||
    cleanId.includes("bakllava") ||
    cleanId.includes("moondream");

  const hasTools =
    isGemma4 ||
    cleanId.includes("qwen") ||
    cleanId.includes("llama") ||
    cleanId.includes("mistral");

  const hasAudio =
    isGemma4 ||
    cleanId.includes("audio") ||
    cleanId.includes("whisper");

  if (meta) {
    return {
      id,
      name: meta.name,
      tag: meta.tag,
      description: meta.description,
      hasThinking: meta.hasThinking ?? isThinkingModel,
      hasVision,
      hasTools,
      hasAudio,
      isMlx,
    };
  }

  // Dinamik etiket türetme (Ollama model isimleri için akıllı etiketler)
  let derivedTag = "Yerel";
  if (isMlx) {
    if (cleanId.includes("12b") || cleanId.includes("9b") || cleanId.includes("7b") || cleanId.includes("small") || cleanId.includes("fast")) {
      derivedTag = "Fast MLX";
    } else if (cleanId.includes("27b") || cleanId.includes("32b") || cleanId.includes("medium")) {
      derivedTag = "Medium MLX";
    } else {
      derivedTag = "MLX";
    }
  } else if (cleanId.includes("r1") || cleanId.includes("deepseek")) {
    derivedTag = "Thinking";
  } else if (cleanId.includes("70b") || cleanId.includes("pro")) {
    derivedTag = "Pro";
  }

  return {
    id,
    name: isMlx && !id.toUpperCase().includes("MLX") ? `${id} (MLX)` : id,
    tag: derivedTag,
    hasThinking: isThinkingModel,
    hasVision,
    hasTools,
    hasAudio,
    isMlx,
  };
}

export function YulaModelSelector({ className }: { className?: string }) {
  const { model, setModel, isThinkingEnabled, setThinkingEnabled } = useYulaChat();
  const [open, setOpen] = React.useState(false);
  const [installedModels, setInstalledModels] = React.useState<ModelOption[]>([]);
  const [isLoaded, setIsLoaded] = React.useState(false);

  // Yerel Ollama üzerindeki YÜKLÜ modelleri canlı çek (yalnız yüklü olanları göster)
  React.useEffect(() => {
    let active = true;
    async function fetchOllamaModels() {
      try {
        const res = await fetch("/api/agent/models");
        if (!res.ok) return;
        const data = (await res.json()) as {
          models?: Array<{
            name: string;
            capabilities?: {
              hasThinking?: boolean;
              hasVision?: boolean;
              hasTools?: boolean;
              hasAudio?: boolean;
              hasEmbedding?: boolean;
              isMlx?: boolean;
            };
          }>;
        };
        if (!active || !Array.isArray(data.models)) return;

        const list = data.models.map((m) => {
          const opt = formatModelOption(m.name);
          if (m.capabilities) {
            if (typeof m.capabilities.hasThinking === "boolean") opt.hasThinking = m.capabilities.hasThinking;
            if (typeof m.capabilities.hasVision === "boolean") opt.hasVision = m.capabilities.hasVision;
            if (typeof m.capabilities.hasTools === "boolean") opt.hasTools = m.capabilities.hasTools;
            if (typeof m.capabilities.hasAudio === "boolean") opt.hasAudio = m.capabilities.hasAudio;
            if (typeof m.capabilities.isMlx === "boolean") opt.isMlx = m.capabilities.isMlx;
          }
          return opt;
        });
        setInstalledModels(list);
        setIsLoaded(true);
      } catch (err) {
        console.warn("[Yula Model Selector] Ollama model listesi alınamadı:", err);
      }
    }
    void fetchOllamaModels();
    return () => {
      active = false;
    };
  }, []);

  // Yalnızca sistemde gerçekten yüklü olan modeller listelenir
  const allModels = React.useMemo(() => {
    if (installedModels.length > 0) {
      if (model && !installedModels.some((m) => m.id === model)) {
        return [formatModelOption(model), ...installedModels];
      }
      return installedModels;
    }
    return [formatModelOption(model || "gemma4:12b-mlx")];
  }, [installedModels, model]);

  // Düşünme modu anahtarı (Switch) AÇIK iken YALNIZCA düşünme destekli modeller listelenir
  const displayedModels = React.useMemo(() => {
    if (!isThinkingEnabled) {
      return allModels;
    }
    const filtered = allModels.filter((m) => m.hasThinking);
    if (filtered.length > 0) return filtered;
    return allModels;
  }, [allModels, isThinkingEnabled]);

  const activeModelInfo = React.useMemo(() => {
    const found = allModels.find((m) => m.id === model);
    if (found) return found;
    return {
      id: model,
      name: model || "Gemma 4 (12B)",
      tag: "Active",
    };
  }, [allModels, model]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 gap-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 rounded-lg transition-all select-none border border-transparent hover:border-border/50",
            open && "bg-muted/80 text-foreground border-border/60",
            className
          )}
          title="Yula AI Modeli Seç"
        >
          <span className="truncate max-w-[150px] font-semibold text-foreground/90">
            {activeModelInfo.name}
          </span>
          <ChevronDown className={cn("size-3 text-muted-foreground shrink-0 transition-transform duration-200", open && "rotate-180")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-64 p-1.5 shadow-xl border border-border/80 bg-popover/95 backdrop-blur-md rounded-xl z-50 animate-in fade-in-0 zoom-in-95"
      >
        <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Model
        </div>
        <div className="space-y-0.5 max-h-56 overflow-y-auto no-scrollbar">
          {displayedModels.map((m) => {
            const isSelected = m.id === model;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setModel(m.id);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-[12px] transition-colors cursor-pointer group/item",
                  isSelected
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "hover:bg-accent/60 text-foreground/80 font-normal"
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="truncate">{m.name}</span>
                  <div className="flex items-center gap-1 shrink-0 opacity-85">
                    {m.hasThinking ? (
                      <Brain className="size-3 text-primary/80 shrink-0" aria-label="Düşünme (Thinking)" />
                    ) : null}
                    {m.hasVision ? (
                      <Eye className="size-3 text-amber-500/80 shrink-0" aria-label="Görsel Okuma (Vision)" />
                    ) : null}
                    {m.hasTools ? (
                      <Wrench className="size-3 text-blue-500/80 shrink-0" aria-label="Araç Çağırma (Tools)" />
                    ) : null}
                    {m.hasAudio ? (
                      <Volume2 className="size-3 text-purple-500/80 shrink-0" aria-label="Ses / İşitme (Audio)" />
                    ) : null}
                    {m.isMlx ? (
                      <Cpu className="size-3 text-emerald-500/80 shrink-0" aria-label="Apple MLX Donanım İvmesi" />
                    ) : null}
                  </div>
                </div>
                {isSelected ? (
                  <Check className="size-3.5 text-primary shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-1 pt-1.5 border-t border-border/60 px-2 py-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground/90 select-none">
            <Brain className="size-3.5 text-primary shrink-0" />
            <span>Düşünme Modu (Thinking)</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isThinkingEnabled}
            onClick={() => setThinkingEnabled(!isThinkingEnabled)}
            className={cn(
              "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
              isThinkingEnabled ? "bg-primary" : "bg-muted-foreground/30"
            )}
            title={isThinkingEnabled ? "Düşünme Modu Açık" : "Düşünme Modu Kapalı"}
          >
            <span
              className={cn(
                "pointer-events-none inline-block size-3 transform rounded-full bg-background shadow-md ring-0 transition duration-200 ease-in-out",
                isThinkingEnabled ? "translate-x-3" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
