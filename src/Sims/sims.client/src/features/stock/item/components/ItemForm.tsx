import * as React from "react"
import { Link } from "react-router-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  ChevronRight,
  ChevronDown,
  Printer,
  MoreHorizontal,
  Plus,
  X,
  Mail,
  UserPlus,
  Paperclip,
  Tag,
  ShoppingBag,
} from "lucide-react"
import { ItemImageUpload } from "./ItemImageUpload"

export function ItemForm() {
  const [descriptionOpen, setDescriptionOpen] = React.useState(false)
  const [uomOpen, setUomOpen] = React.useState(false)
  const [maintainStock, setMaintainStock] = React.useState(true)
  const [disabled, setDisabled] = React.useState(false)
  const [allowAlternative, setAllowAlternative] = React.useState(false)
  const [isZeroRated, setIsZeroRated] = React.useState(false)
  const [isExempt, setIsExempt] = React.useState(false)
  const [isFixedAsset, setIsFixedAsset] = React.useState(false)
  const [showBanner, setShowBanner] = React.useState(true)
  const [showAllActivity, setShowAllActivity] = React.useState(false)
  const [attachments, setAttachments] = React.useState<
    { id: string; name: string }[]
  >([{ id: "1", name: "blck.webp" }])
  const attachmentInputRef = React.useRef<HTMLInputElement>(null)

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 backdrop-blur px-4 text-xs">
        <div className="flex items-center gap-2 overflow-hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList className="text-xs">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/stock">Stock</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/stock/item">Item</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-foreground">
                  GB
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Badge className="ml-2 bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/15 dark:text-emerald-400 font-medium">
            Variant
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <ButtonGroup>
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

          <ButtonGroup>
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

          <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
            Duplicate
          </Button>

          <Button variant="outline" size="icon" className="size-7">
            <Printer className="size-3.5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-7">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem>Reload</DropdownMenuItem>
              <DropdownMenuItem>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" className="h-7 text-xs px-3">
            Save
          </Button>
        </div>
      </header>

      {showBanner ? (
        <div className="flex items-center justify-between gap-3 border-b bg-sky-500/10 px-4 py-2 text-xs text-sky-900 dark:text-sky-100">
          <p>
            This Item is a Variant of{" "}
            <span className="font-semibold underline underline-offset-2">
              12345
            </span>{" "}
            (Template).
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-sky-900 hover:bg-sky-500/20 dark:text-sky-100"
            onClick={() => setShowBanner(false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}

      <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b bg-background px-4 py-1 overflow-x-auto">
          <TabsList variant="line" className="min-w-max">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="variants">Variants</TabsTrigger>
            <TabsTrigger value="accounting">Accounting</TabsTrigger>
            <TabsTrigger value="purchasing">Purchasing</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="tax">Tax</TabsTrigger>
            <TabsTrigger value="quality">Quality</TabsTrigger>
            <TabsTrigger value="manufacturing">Manufacturing</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="details"
          className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0 data-[state=inactive]:hidden"
        >
          <div className="flex-1 p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
              <div className="space-y-5">
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Item Name
                  </FieldLabel>
                  <Input
                    defaultValue="iPhone 13-BLA-128GB"
                    className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                  />
                </Field>

                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Item Group <span className="text-red-500">*</span>
                  </FieldLabel>
                  <Input
                    defaultValue="iPhone"
                    className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                  />
                </Field>

                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Tax Code
                  </FieldLabel>
                  <Input className="bg-muted/20 border-muted-foreground/20 h-9 text-xs" />
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
                    defaultValue="Nos"
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
                  <Label
                    htmlFor="allow-alternative"
                    className="text-xs cursor-pointer"
                  >
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
                    Valuation Rate
                  </FieldLabel>
                  <Input
                    defaultValue="0.00"
                    className="bg-muted/20 border-muted-foreground/20 h-9 text-xs"
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
                    defaultValue=""
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

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Comments</h3>
              <div className="flex items-start gap-3">
                <Avatar className="size-8">
                  <AvatarFallback className="text-[10px] font-semibold">
                    JD
                  </AvatarFallback>
                </Avatar>
                <Textarea
                  placeholder="Type a reply / comment"
                  className="min-h-16 text-xs"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Activity</h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-all-activity"
                      checked={showAllActivity}
                      onCheckedChange={(checked) =>
                        setShowAllActivity(!!checked)
                      }
                    />
                    <Label
                      htmlFor="show-all-activity"
                      className="text-xs cursor-pointer text-muted-foreground"
                    >
                      Show all activity
                    </Label>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                    <Plus className="size-3.5" />
                    New Email
                    <Mail className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                • You last edited this · 3 hours ago
              </p>
            </div>
          </div>

          <div className="w-full lg:w-72 border-l p-4 space-y-4 text-xs bg-muted/10">
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
          </div>
        </TabsContent>

        {[
          "dashboard",
          "inventory",
          "variants",
          "accounting",
          "purchasing",
          "sales",
          "tax",
          "quality",
          "manufacturing",
        ].map((tab) => (
          <TabsContent
            key={tab}
            value={tab}
            className="p-6 m-0 text-xs text-muted-foreground capitalize"
          >
            {tab} content
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}
