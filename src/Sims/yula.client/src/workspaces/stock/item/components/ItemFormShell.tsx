"use client";

import * as React from "react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Separator } from "@/components/ui/separator"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field, FieldLabel } from "@/components/ui/field"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageHeaderTitle } from "@/components/layout/page-header-title"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import {
  ChevronRight,
  ChevronDown,
  Printer,
  MoreHorizontal,
  Plus,
  UserPlus,
  Paperclip,
  Tag,
  ShoppingBag,
  RefreshCw,
} from "lucide-react"
import { DocumentActivity } from "@/components/common/document-activity"
import { DocumentComments } from "@/components/common/document-comments"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { panelCardClass } from "@/components/layout/panel-chrome";
import { ModuleNavPane } from "@/components/layout/module-nav-pane"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspaceBanner } from "@/components/layout/workspace-banner"
import { DetailAside } from "@/components/layout/detail-aside"
import { useWorkspaceSearch } from "@/context/workspace-search-context"
import { ItemImageUpload } from "./ItemImageUpload"
import { ItemTaxTab } from "./ItemTaxTab"
import { printStockItemReport } from "../services/print-stock-report"
import { cn } from "@/utils/cn"
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context"
import { useTranslations } from "next-intl"

export type ItemFormTab =
  | "details"
  | "dashboard"
  | "inventory"
  | "variants"
  | "accounting"
  | "purchasing"
  | "sales"
  | "tax"
  | "report"
  | "quality"
  | "manufacturing"

const TAB_ITEMS: { value: ItemFormTab; labelKey: string }[] = [
  { value: "details", labelKey: "tab_details" },
  { value: "dashboard", labelKey: "tab_dashboard" },
  { value: "inventory", labelKey: "tab_inventory" },
  { value: "variants", labelKey: "tab_variants" },
  { value: "accounting", labelKey: "tab_accounting" },
  { value: "purchasing", labelKey: "tab_purchasing" },
  { value: "sales", labelKey: "tab_sales" },
  { value: "tax", labelKey: "tab_tax" },
  { value: "report", labelKey: "tab_report" },
  { value: "quality", labelKey: "tab_quality" },
  { value: "manufacturing", labelKey: "tab_manufacturing" },
]

const PLACEHOLDER_TABS: ItemFormTab[] = [
  "dashboard",
  "inventory",
  "variants",
  "accounting",
  "purchasing",
  "sales",
  "quality",
  "manufacturing",
]

type ItemFormShellProps = {
  tabs?: ItemFormTab[]
  tabLabels?: Partial<Record<ItemFormTab, string>>
  defaultTab?: ItemFormTab
  /** "item": tam belge formu (banner + aksiyon butonları). "ledger": sade Data Prepare kabuğu. */
  variant?: "item" | "ledger"
}

export function ItemFormShell({
  tabs = TAB_ITEMS.map((tab) => tab.value),
  tabLabels,
  defaultTab,
  variant = "item",
}: ItemFormShellProps) {
  const t = useTranslations("Stock")
  const visibleTabs = React.useMemo(() => new Set(tabs), [tabs])
  const isLedgerVariant = variant === "ledger"

  useScreenAgentContext({
    screenId: "item-form",
    screenTitle: "Item Details",
    workspaceId: "stock",
    activeDataSummary: {
      isViewingResults: false,
      jobId: undefined,
    },
    quickPrompts: [],
    tools: [],
  })

  const initialTab =
    defaultTab && visibleTabs.has(defaultTab)
      ? defaultTab
      : (tabs.find((tab) => visibleTabs.has(tab)) ?? "details")
  const [descriptionOpen, setDescriptionOpen] = React.useState(false)
  const [uomOpen, setUomOpen] = React.useState(false)
  const [maintainStock, setMaintainStock] = React.useState(true)
  const [disabled, setDisabled] = React.useState(false)
  const [allowAlternative, setAllowAlternative] = React.useState(false)
  const [isZeroRated, setIsZeroRated] = React.useState(false)
  const [isExempt, setIsExempt] = React.useState(false)
  const [isFixedAsset, setIsFixedAsset] = React.useState(false)
  const [showBanner, setShowBanner] = React.useState(variant === "item")
  const [attachments, setAttachments] = React.useState<
    { id: string; name: string }[]
  >([
    { id: "1", name: "w6ed16z8-hdn-kahverengi.jpg" },
    { id: "2", name: "lcw-seyahat-cantasi-spec.pdf" },
  ])
  const attachmentInputRef = React.useRef<HTMLInputElement>(null)
  // Workspace search açıkken floating header gizlenir — arama görünümü
  // AppHeader altındaki tüm alanı kaplar (ana ekran davranışı).
  const { open: searchOpen } = useWorkspaceSearch()

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspacePageHeader
        showSearch={false}
        startExtra={
          !isLedgerVariant ? (
            <Badge className="ml-2 hidden shrink-0 bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/15 dark:text-emerald-400 font-medium sm:inline-flex">
              {t("badge_variant")}
            </Badge>
          ) : null
        }
        actions={
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
                  <DropdownMenuItem className="sm:hidden" onClick={() => void printStockItemReport()}>{t("btn_print")}</DropdownMenuItem>
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
        }
      >
        <PageHeaderTitle>W6ED16Z8-HDN</PageHeaderTitle>
      </WorkspacePageHeader>

      {!searchOpen && showBanner && !isLedgerVariant ? (
        <WorkspaceBanner tone="info" onDismiss={() => setShowBanner(false)}>
          {t("variant_banner", {
            code: t("variant_banner_code"),
            name: t("variant_banner_name"),
          })}
        </WorkspaceBanner>
      ) : null}

      <WorkspaceAiDock
        className={cn(
          "overflow-hidden",
          isLedgerVariant && "max-md:overflow-y-auto"
        )}
      >
        <ModuleNavPane>
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          )}
        >
        <div className={cn(panelCardClass, "min-h-0 flex-1")}>
        <Tabs defaultValue={initialTab} className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden">
          <div className="shrink-0 border-b border-border px-3">
            <ScrollArea type="hover" className="w-full whitespace-nowrap">
              <div className="py-1">
                <TabsList variant="line" className="min-w-max">
                  {tabs
                    .filter((tab) => visibleTabs.has(tab))
                    .map((tab) => {
                      const item = TAB_ITEMS.find((entry) => entry.value === tab)
                      if (!item) return null
                      return (
                        <TabsTrigger key={tab} value={tab}>
                          {tabLabels?.[tab] ?? t(item.labelKey)}
                        </TabsTrigger>
                      )
                    })}
                </TabsList>
              </div>
            </ScrollArea>
          </div>

          <div className="@container/item-details flex min-h-0 flex-1 flex-col overflow-y-auto">
          {visibleTabs.has("details") ? (
          <TabsContent
            value="details"
            className="m-0 grid grid-cols-1 @[56rem]/item-details:grid-cols-[minmax(0,1fr)_18rem] data-[state=inactive]:hidden"
          >
            <div className="min-w-0 space-y-5 p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-x-10 gap-y-5 @[40rem]/item-details:grid-cols-2">
                <div className="space-y-5">
                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      {t("f_item_name")}
                    </FieldLabel>
                    <Input
                      defaultValue="Deri Görünümlü Erkek Seyahat Çantası"
                      className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      {t("f_item_group")} <span className="text-red-500">*</span>
                    </FieldLabel>
                    <Input
                      defaultValue="Seyahat Çantası"
                      className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      {t("f_tax_code")}
                    </FieldLabel>
                    <Input defaultValue="KDV-%10" className="bg-muted/20 border-muted-foreground/20 h-9 text-xs" />
                  </Field>

                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="is-zero-rated"
                      checked={isZeroRated}
                      onCheckedChange={(checked) => setIsZeroRated(!!checked)}
                    />
                    <Label htmlFor="is-zero-rated" className="text-xs cursor-pointer">
                      {t("f_is_zero_rated")}
                    </Label>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="is-exempt"
                      checked={isExempt}
                      onCheckedChange={(checked) => setIsExempt(!!checked)}
                    />
                    <Label htmlFor="is-exempt" className="text-xs cursor-pointer">
                      {t("f_is_exempt")}
                    </Label>
                  </div>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      {t("f_default_uom")} <span className="text-red-500">*</span>
                    </FieldLabel>
                    <Input
                      defaultValue="Adet"
                      className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                    />
                  </Field>
                </div>

                <div className="space-y-5">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="disabled"
                      checked={disabled}
                      onCheckedChange={(checked) => setDisabled(!!checked)}
                    />
                    <Label htmlFor="disabled" className="text-xs cursor-pointer">
                      {t("f_disabled")}
                    </Label>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="allow-alternative"
                      checked={allowAlternative}
                      onCheckedChange={(checked) => setAllowAlternative(!!checked)}
                    />
                    <Label htmlFor="allow-alternative" className="text-xs cursor-pointer">
                      {t("f_allow_alternative_item")}
                    </Label>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="maintain-stock"
                      checked={maintainStock}
                      onCheckedChange={(checked) => setMaintainStock(!!checked)}
                    />
                    <Label
                      htmlFor="maintain-stock"
                      className="text-xs cursor-pointer"
                    >
                      {t("f_maintain_stock")}
                    </Label>
                  </div>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      {t("f_valuation_rate_try")}
                    </FieldLabel>
                    <Input
                      defaultValue="1,199.99"
                      className="bg-muted/20 border-muted-foreground/20 h-9 text-xs font-medium"
                    />
                  </Field>

                  <div className="flex items-center gap-2.5 opacity-60">
                    <Checkbox
                      id="is-fixed-asset"
                      checked={isFixedAsset}
                      disabled
                      onCheckedChange={(checked) => setIsFixedAsset(!!checked)}
                    />
                    <Label htmlFor="is-fixed-asset" className="text-xs">
                      {t("f_is_fixed_asset")}
                    </Label>
                  </div>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      {t("f_over_delivery_receipt_allowance")}
                    </FieldLabel>
                    <Input
                      defaultValue="0.000"
                      className="bg-muted/20 border-muted-foreground/20 h-9 text-xs"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      {t("f_over_billing_allowance")}
                    </FieldLabel>
                    <Input
                      defaultValue="0.000"
                      className="bg-muted/20 border-muted-foreground/20 h-9 text-xs"
                    />
                  </Field>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Collapsible open={descriptionOpen} onOpenChange={setDescriptionOpen}>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <ChevronRight
                      className={`size-4 transition-transform duration-200 ${
                        descriptionOpen ? "rotate-90" : ""
                      }`}
                    />
                    {t("f_description")}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pl-6">
                    <Textarea
                      placeholder={t("f_description_placeholder")}
                      className="min-h-24 text-xs resize-none"
                      defaultValue="LCW ACCESSORIES Kahverengi Deri Görünümlü Erkek Seyahat Çantası. %100 Poliüretan suni deri dış yüzey, %100 polyester astar. Fermuarlı geniş ana bölme, ön fermuarlı cep ve ayarlanabilir omuz askısı."
                    />
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                <Collapsible open={uomOpen} onOpenChange={setUomOpen}>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <ChevronRight
                      className={`size-4 transition-transform duration-200 ${
                        uomOpen ? "rotate-90" : ""
                      }`}
                    />
                    {t("f_units_of_measure")}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pl-6 text-xs text-muted-foreground">
                    {t("f_uom_empty")}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>

            <aside className="w-full space-y-4 border-t bg-muted/10 p-3 text-xs @[56rem]/item-details:row-span-2 @[56rem]/item-details:border-l @[56rem]/item-details:border-t-0 sm:p-4">
              <DetailAside
                image={<ItemImageUpload />}
                addControl={
                  <div className="space-y-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <UserPlus className="size-3.5" />
                        {t("f_assigned_to")}
                      </span>
                      <Plus className="size-3.5" />
                    </Button>
                    <div>
                      <Button
                        variant="ghost"
                        className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => attachmentInputRef.current?.click()}
                      >
                        <span className="flex items-center gap-2">
                          <Paperclip className="size-3.5" />
                          {t("f_attachments")}
                        </span>
                        <Plus className="size-3.5" />
                      </Button>
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        className="sr-only"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? [])
                          if (files.length === 0) {
                            return
                          }
                          setAttachments((prev) => [
                            ...prev,
                            ...files.map((file) => ({
                              id: `${file.name}-${file.lastModified}-${file.size}`,
                              name: file.name,
                            })),
                          ])
                          event.target.value = ""
                        }}
                      />
                    </div>
                  </div>
                }
                files={attachments.map((file) => ({
                  key: file.id,
                  name: file.name,
                  icon: <ShoppingBag className="size-3.5 shrink-0" />,
                }))}
                onRemoveFile={(key) =>
                  setAttachments((prev) =>
                    prev.filter((item) => item.id !== key)
                  )
                }
              />

              <div className="space-y-1">
                <Button
                  variant="ghost"
                  className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <Tag className="size-3.5" />
                    {t("f_tags")}
                  </span>
                  <Plus className="size-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus className="size-3.5" />
                    {t("f_share")}
                  </span>
                  <Plus className="size-3.5" />
                </Button>
              </div>

              <Separator />

              <div className="space-y-3 text-muted-foreground text-[11px]">
                <div>
                  <p className="font-medium text-foreground">{t("panel_administrator")}</p>
                  <p>{t("panel_last_edited")}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("panel_administrator")}</p>
                  <p>{t("panel_created")}</p>
                </div>
              </div>
            </aside>

            <div className="min-w-0 space-y-5 p-3 pt-0 sm:p-4 sm:pt-0">
              <Separator />
              <DocumentComments />
              <DocumentActivity />
            </div>
          </TabsContent>
          ) : null}

          {visibleTabs.has("tax") ? (
          <TabsContent
            value="tax"
            className="m-0 data-[state=inactive]:hidden"
          >
            <ItemTaxTab />
          </TabsContent>
          ) : null}

          {PLACEHOLDER_TABS.filter((tab) => visibleTabs.has(tab)).map((tab) => (
            <TabsContent
              key={tab}
              value={tab}
              className="m-0 p-3 text-xs capitalize text-muted-foreground data-[state=inactive]:hidden sm:p-4"
            >
              {t("tab_content")} {tab}
            </TabsContent>
          ))}
          </div>
        </Tabs>
        </div>
        </div>
        </ModuleNavPane>
      </WorkspaceAiDock>
    </div>
  )
}
