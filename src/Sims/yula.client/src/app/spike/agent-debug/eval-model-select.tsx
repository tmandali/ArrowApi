"use client";

import * as React from "react";
import { Bot, RefreshCw } from "lucide-react";

export interface ModelItem {
  id: string;
  name: string;
  provider: string;
  providerLabel?: string;
  hasThinking?: boolean;
}

export interface EvalModelSelectProps {
  selectedProvider: string;
  selectedModel: string;
  onSelect: (provider: string, model: string) => void;
  disabled?: boolean;
}

export function EvalModelSelect({
  selectedProvider,
  selectedModel,
  onSelect,
  disabled = false,
}: EvalModelSelectProps) {
  const [models, setModels] = React.useState<ModelItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;

    fetch("/api/agent/models")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const list: ModelItem[] = data.allModels || data.models || [];
        setModels(list);

        // If no model selected yet, default to first available
        if (!selectedModel && list.length > 0) {
          const defaultItem = list.find((m) => m.provider === data.provider) || list[0];
          onSelect(defaultItem.provider, defaultItem.id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = React.useMemo(() => {
    const map = new Map<string, ModelItem[]>();
    for (const m of models) {
      const p = m.provider || "default";
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(m);
    }
    return Array.from(map.entries());
  }, [models]);

  const currentValue = `${selectedProvider}:${selectedModel}`;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const [p, ...rest] = val.split(":");
    const m = rest.join(":");
    if (p && m) {
      onSelect(p, m);
    }
  };

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/60 hover:bg-muted border rounded-lg text-xs transition-colors">
      {loading ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <Bot className="h-3.5 w-3.5 text-primary" />
      )}
      <select
        value={currentValue}
        onChange={handleChange}
        disabled={disabled || loading}
        className="bg-transparent font-medium text-foreground outline-none cursor-pointer text-xs disabled:opacity-50 max-w-[160px] truncate"
      >
        {models.length === 0 ? (
          <option value="ollama:default">Varsayılan Model</option>
        ) : (
          grouped.map(([provider, providerModels]) => (
            <optgroup key={provider} label={provider.toUpperCase()}>
              {providerModels.map((m) => (
                <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                  {m.name || m.id} {m.hasThinking ? "💭" : ""}
                </option>
              ))}
            </optgroup>
          ))
        )}
      </select>
    </div>
  );
}
