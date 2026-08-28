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
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell"
import { Separator } from "@/components/ui/separator"
import { panelCardClass, pageContentGutterClass } from "@/components/layout/panel-chrome"
import { cn } from "@/utils/cn"
import { useActiveCompany } from "@/features/company/hooks/use-active-company"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Field,
  FieldLabel,
} from "@/components/ui/field"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"

import {
  ChevronRight,
  ChevronDown,
  Printer,
  MoreHorizontal,
  Plus,
  Copy,
  Calendar as CalendarIcon,
  User,
  Paperclip,
  Tag,
  Share2,
  Info,
} from "lucide-react"

export function SellingForm() {
  const { company } = useActiveCompany()
  const [accountingOpen, setAccountingOpen] = React.useState(false)
  const [currencyOpen, setCurrencyOpen] = React.useState(false)
  const [isSubcontracted, setIsSubcontracted] = React.useState(true)
  const [orderDate, setOrderDate] = React.useState<Date | undefined>(new Date(2025, 9, 14))
  const [deliveryDate, setDeliveryDate] = React.useState<Date | undefined>(new Date(2025, 9, 14))

  return (
    <WorkspacePageShell
      showSearch={false}
      startExtra={
        <Badge variant="destructive" className="ml-2 font-medium">
          Overdue
        </Badge>
      }
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/selling" state={{ yulaClosed: true }}>Selling</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Sales Order</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-foreground">
                SAL-ORD-2025-0038
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      actions={
        <>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Status</span>
            <Select defaultValue="overdue">
              <SelectTrigger className="h-7 w-28 text-xs font-normal">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem
                  value="overdue"
                  className="text-red-600 font-semibold"
                >
                  Overdue
                </SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ButtonGroup>
            <Button size="sm" className="h-7 text-xs px-3">
              Create
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-7 px-1.5">
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem>Work Order</DropdownMenuItem>
                <DropdownMenuItem>Delivery Note</DropdownMenuItem>
                <DropdownMenuItem>Sales Invoice</DropdownMenuItem>
                <DropdownMenuItem>Material Request</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>

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
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem>Reload</DropdownMenuItem>
              <DropdownMenuItem>View Ledger</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
            Cancel
          </Button>

          <AIChatAssistant />
        </>
      }
    >
      <div
        className={cn(
          pageContentGutterClass,
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        )}
      >
        <div className={cn(panelCardClass, "min-h-0 flex-1")}>
            {/* Standard shadcn Tabs Container */}
            <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-primary/15 px-4 py-1 dark:border-primary/25">
            <TabsList variant="line">
              <TabsTrigger value="details">
                Details
              </TabsTrigger>
              <TabsTrigger value="address">
                Address & Contact
              </TabsTrigger>
              <TabsTrigger value="terms">
                Terms
              </TabsTrigger>
              <TabsTrigger value="more-info">
                <Info className="size-3" />
                More Info
              </TabsTrigger>
              <TabsTrigger value="connections">
                Connections
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="details" className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
            {/* Main Form Content */}
            <div className="flex-1 p-6 space-y-6">
              {/* Form Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Row 1 */}
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Customer <span className="text-red-500">*</span>
                  </FieldLabel>
                  <Input
                    defaultValue="Raymond"
                    className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                  />
                </Field>

                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Date <span className="text-red-500">*</span>
                  </FieldLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-9 justify-between text-left font-normal text-xs bg-muted/30 border-muted-foreground/20 px-2.5"
                      >
                        {orderDate ? (
                          orderDate.toLocaleDateString("en-GB").replace(/\//g, "-")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="size-4 text-muted-foreground/60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={orderDate}
                        onSelect={setOrderDate}
                      />
                    </PopoverContent>
                  </Popover>
                </Field>

                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Customer&apos;s Purchase Order
                  </FieldLabel>
                  <Input className="bg-muted/20 border-muted-foreground/20 h-9 text-xs" />
                </Field>

                {/* Row 2 */}
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Customer Name in Arabic
                  </FieldLabel>
                  <Input className="bg-muted/20 border-muted-foreground/20 h-9 text-xs" />
                </Field>

                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">Delivery Date</FieldLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-9 justify-between text-left font-normal text-xs bg-muted/30 border-muted-foreground/20 px-2.5"
                      >
                        {deliveryDate ? (
                          deliveryDate.toLocaleDateString("en-GB").replace(/\//g, "-")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="size-4 text-muted-foreground/60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={deliveryDate}
                        onSelect={setDeliveryDate}
                      />
                    </PopoverContent>
                  </Popover>
                </Field>

                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Company <span className="text-red-500">*</span>
                  </FieldLabel>
                  <Input
                    key={company?.id ?? "company"}
                    defaultValue={company?.name ?? ""}
                    className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                  />
                </Field>

                {/* Row 3 */}
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">Tax Id</FieldLabel>
                  <Input className="bg-muted/20 border-muted-foreground/20 h-9 text-xs" />
                </Field>

                {/* Highlighted Checkbox with Field wrapper */}
                <div className="flex items-center pt-5">
                  <div className="flex items-center gap-2.5 rounded-md border-2 border-red-500/80 bg-red-500/5 p-2.5 shadow-sm transition-all hover:bg-red-500/10 w-full">
                    <Checkbox
                      id="subcontracted"
                      checked={isSubcontracted}
                      onCheckedChange={(checked) => setIsSubcontracted(!!checked)}
                    />
                    <Label
                      htmlFor="subcontracted"
                      className="text-xs font-semibold cursor-pointer text-foreground select-none"
                    >
                      Is Subcontracted
                    </Label>
                  </div>
                </div>

                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Order Type <span className="text-red-500">*</span>
                  </FieldLabel>
                  <Input
                    defaultValue="Sales"
                    className="bg-muted/30 border-muted-foreground/20 h-9 text-xs"
                  />
                </Field>
              </div>

              <Separator className="my-6" />

              {/* Collapsible Sections with shadcn Collapsible */}
              <div className="space-y-4">
                <Collapsible open={accountingOpen} onOpenChange={setAccountingOpen}>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <ChevronRight
                      className={`size-4 transition-transform duration-200 ${
                        accountingOpen ? "rotate-90" : ""
                      }`}
                    />
                    Accounting Dimensions
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pl-6 text-xs text-muted-foreground">
                    No additional accounting dimensions configured.
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                <Collapsible open={currencyOpen} onOpenChange={setCurrencyOpen}>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <ChevronRight
                      className={`size-4 transition-transform duration-200 ${
                        currencyOpen ? "rotate-90" : ""
                      }`}
                    />
                    Currency and Price List
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pl-6 text-xs text-muted-foreground">
                    Currency: TRY / Price List: Standard Selling
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <Separator className="my-6" />

              {/* Items Section with shadcn Table */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Items</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Scan Barcode</Label>
                    <Input className="bg-muted/20 border-muted-foreground/20 h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Set Source Warehouse</Label>
                    <Input className="bg-muted/20 border-muted-foreground/20 h-9 text-xs" />
                  </div>
                </div>

                {/* Items Table - Official shadcn Table Components */}
                <div className="rounded-md border bg-card overflow-hidden">
                  <div className="border-b px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
                    Items
                  </div>
                  <Table>
                    <TableHeader className="bg-muted/20">
                      <TableRow>
                        <TableHead className="w-10 text-center">
                          <Checkbox />
                        </TableHead>
                        <TableHead className="w-12">No.</TableHead>
                        <TableHead>
                          Item Code <span className="text-red-500">*</span>
                        </TableHead>
                        <TableHead>
                          Delivery Date <span className="text-red-500">*</span>
                        </TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-center">
                          <Checkbox />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">1</TableCell>
                        <TableCell className="font-medium text-foreground">SUB-ITEM-001</TableCell>
                        <TableCell>14-10-2025</TableCell>
                        <TableCell>10.00</TableCell>
                        <TableCell>₺ 250.00</TableCell>
                        <TableCell className="font-medium text-foreground">₺ 2,500.00</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-6">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>Edit Details</DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600">Delete Row</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  <div className="p-2 border-t bg-muted/10 flex justify-between items-center text-xs">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                      <Plus className="size-3.5 mr-1" /> Add Row
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Sidebar Metadata */}
            <div className="w-full lg:w-72 border-l p-4 space-y-6 text-xs bg-muted/10">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-foreground">Raymond</h4>
                  <p className="text-muted-foreground text-xs font-mono">SAL-ORD-2025-0038</p>
                </div>
                <Button variant="ghost" size="icon" className="size-6">
                  <Copy className="size-3.5 text-muted-foreground" />
                </Button>
              </div>

              <Separator />

              {/* Quick Actions List using shadcn Button components */}
              <div className="space-y-1">
                <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <User className="size-3.5" />
                    Assign
                  </span>
                  <Plus className="size-3.5" />
                </Button>

                <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <Paperclip className="size-3.5" />
                    Attachments
                  </span>
                  <Plus className="size-3.5" />
                </Button>

                <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <Tag className="size-3.5" />
                    Tags
                  </span>
                  <Plus className="size-3.5" />
                </Button>

                <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <Share2 className="size-3.5" />
                    Share
                  </span>
                  <Plus className="size-3.5" />
                </Button>
              </div>

              <Separator />

              {/* Activity History */}
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

          <TabsContent value="address" className="p-6 m-0 text-xs text-muted-foreground">
            Address & Contact Details
          </TabsContent>
          <TabsContent value="terms" className="p-6 m-0 text-xs text-muted-foreground">
            Terms & Conditions
          </TabsContent>
          <TabsContent value="more-info" className="p-6 m-0 text-xs text-muted-foreground">
            Additional Information
          </TabsContent>
          <TabsContent value="connections" className="p-6 m-0 text-xs text-muted-foreground">
            Connected Documents & Links
          </TabsContent>
            </Tabs>
            </div>
          </div>
    </WorkspacePageShell>
  )
}
