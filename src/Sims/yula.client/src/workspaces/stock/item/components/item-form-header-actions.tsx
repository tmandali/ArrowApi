"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AIChatAssistant } from "@/components/layout/ai-chat/ai-chat-assistant";
import {
  ChevronDown,
  Printer,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { printStockItemReport } from "../services/print-stock-report";
import { useTranslations } from "next-intl";

export interface ItemFormHeaderActionsProps {
  isLedgerVariant?: boolean;
}

export function ItemFormHeaderActions({
  isLedgerVariant,
}: ItemFormHeaderActionsProps) {
  const t = useTranslations("Stock");

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] sm:gap-2 [&::-webkit-scrollbar]:hidden">
      {isLedgerVariant ? (
        <div className="flex shrink-0 items-center gap-1.5 overflow-hidden sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0"
            aria-label={t("aa_refresh")}
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <AIChatAssistant />
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5 overflow-hidden sm:gap-2">
          <ButtonGroup className="hidden md:inline-flex">
            <Button variant="outline" size="sm" className="h-7 text-xs px-3">
              {t("btn_view")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-1.5">
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem>{t("dd_print_format")}</DropdownMenuItem>
                <DropdownMenuItem>{t("dd_stock_ledger")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>

          <ButtonGroup className="hidden sm:inline-flex">
            <Button variant="outline" size="sm" className="h-7 text-xs px-3">
              {t("btn_actions")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-1.5">
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem>{t("dd_make_stock_entry")}</DropdownMenuItem>
                <DropdownMenuItem>{t("dd_open_material_request")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>

          <Button
            variant="outline"
            size="sm"
            className="hidden h-7 text-xs px-2.5 lg:inline-flex"
          >
            {t("btn_duplicate")}
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="hidden size-7 sm:inline-flex"
            onClick={() => void printStockItemReport()}
            title={t("aa_print_report")}
            aria-label={t("aa_print_report")}
          >
            <Printer className="size-3.5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-7">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem className="md:hidden">{t("btn_view")}</DropdownMenuItem>
              <DropdownMenuItem className="sm:hidden">{t("btn_actions")}</DropdownMenuItem>
              <DropdownMenuItem className="lg:hidden">{t("btn_duplicate")}</DropdownMenuItem>
              <DropdownMenuItem className="sm:hidden" onClick={() => void printStockItemReport()}>
                {t("btn_print")}
              </DropdownMenuItem>
              <DropdownMenuItem>{t("btn_reload")}</DropdownMenuItem>
              <DropdownMenuItem>{t("btn_delete")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" className="h-7 text-xs px-3">
            {t("btn_save")}
          </Button>
          <AIChatAssistant />
        </div>
      )}
    </div>
  );
}
