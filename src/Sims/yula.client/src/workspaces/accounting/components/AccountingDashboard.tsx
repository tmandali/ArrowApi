"use client";

import * as React from "react";
import { BarChart2Icon } from "lucide-react";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { BlankWorkspaceLanding } from "@/components/layout/blank-workspace-landing";

export function AccountingDashboard() {
  return (
    <WorkspacePageShell showSearch={false} frameless>
      <BlankWorkspaceLanding
        title="Accounting Dashboard"
        description="Bilanço, gelir tablosu, nakit akışı, genel mizan ve finansal ekstreler özet panosu."
        icon={BarChart2Icon}
      />
    </WorkspacePageShell>
  );
}
