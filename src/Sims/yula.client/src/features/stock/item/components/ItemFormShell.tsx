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
import { PagePanelTrigger } from "@/components/layout/page-panel-trigger"
import { PageHeaderTitle } from "@/components/layout/page-header-title"
import {
  ChevronRight,
  ChevronDown,
  Printer,
  MoreHorizontal,
  Plus,
  X,
  UserPlus,
  Paperclip,
  Tag,
  ShoppingBag,
  RefreshCw,
} from "lucide-react"
import { DocumentActivity } from "@/components/common/document-activity"
import { DocumentComments } from "@/components/common/document-comments"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import {
  pageContentGutterClass,
  pageHeaderCardClass,
  pageHeaderShellClass,
  panelCardClass,
} from "@/components/layout/panel-chrome"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspaceBanner } from "@/components/layout/workspace-banner"
import { ItemImageUpload } from "./ItemImageUpload"
import { ItemTaxTab } from "./ItemTaxTab"
import { printStockItemReport } from "../services/print-stock-report"
import { cn } from "@/utils/cn"
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context"

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

const TAB_ITEMS: { value: ItemFormTab; label: string }[] = [
  { value: "details", label: "Details" },
  { value: "dashboard", label: "Dashboard" },
  { value: "inventory", label: "Inventory" },
  { value: "variants", label: "Variants" },
  { value: "accounting", label: "Accounting" },
  { value: "purchasing", label: "Purchasing" },
  { value: "sales", label: "Sales" },
  { value: "tax", label: "Tax" },
  { value: "report", label: "Report" },
  { value: "quality", label: "Quality" },
  { value: "manufacturing", label: "Manufacturing" },
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

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className={pageHeaderShellClass}>
      <header
        className={cn(
          pageHeaderCardClass,
          "justify-between gap-1.5 sm:gap-2"
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2">
          <PagePanelTrigger
            className="-ml-1 shrink-0"
            separatorClassName="mr-1 hidden data-vertical:h-4 data-vertical:self-auto sm:mr-2 sm:block"
          />
          <PageHeaderTitle>W6ED16Z8-HDN</PageHeaderTitle>
          {!isLedgerVariant ? (
            <Badge className="ml-2 hidden shrink-0 bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/15 dark:text-emerald-400 font-medium sm:inline-flex">
              Variant
            </Badge>
          ) : null}
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:gap-2">
          {isLedgerVariant ? (
            <div className="flex shrink-0 items-center gap-1.5 overflow-hidden sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                aria-label="Refresh"
              >
                <RefreshCw className="size-3.5" />
              </Button>
              <AIChatAssistant />
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5 overflow-hidden sm:gap-2">
              <ButtonGroup className="hidden md:inline-flex">
                <Button variant="outline" size="sm" className="h-7 text-xs px-3">
                  View
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 px-1.5">
                      <ChevronDown className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem>Print Format</DropdownMenuItem>
                    <DropdownMenuItem>Stock Ledger</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ButtonGroup>

              <ButtonGroup className="hidden sm:inline-flex">
                <Button variant="outline" size="sm" className="h-7 text-xs px-3">
                  Actions
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 px-1.5">
                      <ChevronDown className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem>Make Stock Entry</DropdownMenuItem>
                    <DropdownMenuItem>Open Material Request</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ButtonGroup>

              <Button
                variant="outline"
                size="sm"
                className="hidden h-7 text-xs px-2.5 lg:inline-flex"
              >
                Duplicate
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="hidden size-7 sm:inline-flex"
                onClick={() => void printStockItemReport()}
                title="Print report"
                aria-label="Print report"
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
                  <DropdownMenuItem className="md:hidden">View</DropdownMenuItem>
                  <DropdownMenuItem className="sm:hidden">Actions</DropdownMenuItem>
                  <DropdownMenuItem className="lg:hidden">Duplicate</DropdownMenuItem>
                  <DropdownMenuItem className="sm:hidden" onClick={() => void printStockItemReport()}>Print</DropdownMenuItem>
                  <DropdownMenuItem>Reload</DropdownMenuItem>
                  <DropdownMenuItem>Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button size="sm" className="h-7 text-xs px-3">
                Save
              </Button>
              <AIChatAssistant />
            </div>
          )}
        </div>
      </header>
      </div>

      {showBanner && !isLedgerVariant ? (
        <WorkspaceBanner tone="info" onDismiss={() => setShowBanner(false)}>
          This Item is a Variant of{" "}
          <span className="font-semibold underline underline-offset-2">
            W6ED16Z8
          </span>{" "}
          (Seyahat Çantası - LCW ACCESSORIES).
        </WorkspaceBanner>
      ) : null}

      <WorkspaceAiDock
        className={cn(
          "overflow-hidden",
          isLedgerVariant && "max-md:overflow-y-auto"
        )}
      >
        <div
          className={cn(
            pageContentGutterClass,
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          )}
        >
        <div className={cn(panelCardClass, "min-h-0 flex-1")}>
        <Tabs defaultValue={initialTab} className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden">
          <div className="shrink-0 border-b border-primary/15 px-3 dark:border-primary/25">
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
                          {tabLabels?.[tab] ?? item.label}
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
                      Item Name
                    </FieldLabel>
                    <Input
                      defaultValue="Deri Görünümlü Erkek Seyahat Çantası"
                      className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      Item Group <span className="text-red-500">*</span>
                    </FieldLabel>
                    <Input
                      defaultValue="Seyahat Çantası"
                      className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      Tax Code
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
                      Is Zero Rated
                    </Label>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="is-exempt"
                      checked={isExempt}
                      onCheckedChange={(checked) => setIsExempt(!!checked)}
                    />
                    <Label htmlFor="is-exempt" className="text-xs cursor-pointer">
                      Is Exempt
                    </Label>
                  </div>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      Default Unit of Measure <span className="text-red-500">*</span>
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
                      Disabled
                    </Label>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="allow-alternative"
                      checked={allowAlternative}
                      onCheckedChange={(checked) => setAllowAlternative(!!checked)}
                    />
                    <Label htmlFor="allow-alternative" className="text-xs cursor-pointer">
                      Allow Alternative Item
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
                      Maintain Stock
                    </Label>
                  </div>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      Valuation Rate (TRY)
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
                      Is Fixed Asset
                    </Label>
                  </div>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      Over Delivery/Receipt Allowance (%)
                    </FieldLabel>
                    <Input
                      defaultValue="0.000"
                      className="bg-muted/20 border-muted-foreground/20 h-9 text-xs"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      Over Billing Allowance (%)
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
                    Description
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pl-6">
                    <Textarea
                      placeholder="Item description…"
                      className="min-h-24 text-xs"
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
                    Units of Measure
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pl-6 text-xs text-muted-foreground">
                    No additional units of measure configured.
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>

            <aside className="w-full space-y-4 border-t bg-muted/10 p-3 text-xs @[56rem]/item-details:row-span-2 @[56rem]/item-details:border-l @[56rem]/item-details:border-t-0 sm:p-4">
              <ItemImageUpload />

              <div className="space-y-1">
                <Button
                  variant="ghost"
                  className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus className="size-3.5" />
                    Assigned To
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
                      Attachments
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
                  {attachments.length > 0 ? (
                    <div className="mt-1 space-y-1 pl-2">
                      {attachments.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/60"
                        >
                          <ShoppingBag className="size-3.5 shrink-0" />
                          <span className="truncate flex-1">{file.name}</span>
                          <button
                            type="button"
                            className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                            onClick={() =>
                              setAttachments((prev) =>
                                prev.filter((item) => item.id !== file.id)
                              )
                            }
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <Button
                  variant="ghost"
                  className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <Tag className="size-3.5" />
                    Tags
                  </span>
                  <Plus className="size-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus className="size-3.5" />
                    Share
                  </span>
                  <Plus className="size-3.5" />
                </Button>
              </div>

              <Separator />

              <div className="space-y-3 text-muted-foreground text-[11px]">
                <div>
                  <p className="font-medium text-foreground">Administrator</p>
                  <p>last edited this · 2 months ago</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Administrator</p>
                  <p>created this · 2 months ago</p>
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
              {tab} content
            </TabsContent>
          ))}
          </div>
        </Tabs>
        </div>
        </div>
      </WorkspaceAiDock>
    </div>
  )
}
