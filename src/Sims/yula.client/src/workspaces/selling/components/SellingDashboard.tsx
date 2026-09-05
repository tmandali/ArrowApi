"use client";

import * as React from "react";
import { ShoppingCartIcon } from "lucide-react";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export function SellingDashboard() {
  return (
    <WorkspacePageShell showSearch={false} frameless>
      <BlankWorkspaceLanding
        title="Selling Dashboard"
        description="Satış siparişleri, müşteri teklifleri, faturalar ve satış analitiği özet panosu."
        icon={ShoppingCartIcon}
      />
    </WorkspacePageShell>
  );
}
