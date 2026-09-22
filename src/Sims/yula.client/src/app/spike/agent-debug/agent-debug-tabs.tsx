"use client";

import * as React from "react";
import { AgentDebugBench } from "./agent-debug-bench";
import { ErpEvalsBench } from "./evals-bench";
import { UserCheck, ShieldCheck } from "lucide-react";

export function AgentDebugTabs() {
  const [activeTab, setActiveTab] = React.useState<"persona_rag" | "evals">("persona_rag");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Top Tab Switcher Bar */}
      <div className="border-b bg-card px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("persona_rag")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === "persona_rag"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <UserCheck className="h-4 w-4" />
            Persona & RAG Teşhisi
          </button>

          <button
            onClick={() => setActiveTab("evals")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === "evals"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            ERP Evals Benchmark (12 Case)
          </button>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          Pi / ServiceNow AgentArch Workbench
        </span>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-auto">
        {activeTab === "persona_rag" ? <AgentDebugBench /> : <ErpEvalsBench />}
      </div>
    </div>
  );
}
