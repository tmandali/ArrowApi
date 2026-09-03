"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { indexWorkspaceMenus } from "@/services/duckdb-vector";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StockDashboard } from "./StockDashboard";

export function StockPageForm() {
  React.useEffect(() => {
    // Arka planda Stock workspace menülerini WASM RAG vektör store'a indeksle
    void indexWorkspaceMenus();
  }, []);

  return (
    <WorkspacePageShell
      showSearch={true}
      searchPlaceholder="Modül veya menü ara (ör: Stock Ledger, Seri Takibi)..."
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/stock">Stock</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      actions={
        <>
          <Button variant="outline" size="icon" aria-label="Refresh">
            <RefreshCw />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem>Customize Workspace</DropdownMenuItem>
                <DropdownMenuItem>User Permissions</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <AIChatAssistant />
        </>
      }
    >
      <StockDashboard />
    </WorkspacePageShell>
  );
}
