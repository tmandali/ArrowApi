"use client";

import * as React from "react";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { indexWorkspaceMenus } from "@/services/duckdb-vector";
import { StockDashboard } from "./StockDashboard";

export function StockPageForm() {
  React.useEffect(() => {
    // Arka planda Stock workspace menülerini WASM RAG vektör store'a indeksle
    void indexWorkspaceMenus();
  }, []);

  return (
    <WorkspacePageShell
      showSearch={false}
      frameless
    >
      <StockDashboard />
    </WorkspacePageShell>
  );
}
