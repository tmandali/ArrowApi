import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell"
import { panelCardClass, pageContentGutterClass } from "@/components/layout/panel-chrome"
import { cn } from "@/utils/cn"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  MoreHorizontal,
  Plus,
  Copy,
  User,
  Paperclip,
  Share2,
  Send,
} from "lucide-react"

export function ManufacturingForm() {
  const [enableStockReservation, setEnableStockReservation] = React.useState(true)
  const [autoReserveStock, setAutoReserveStock] = React.useState(true)
  const [allowPartialReservation, setAllowPartialReservation] = React.useState(true)
  const [autoReserveForSales, setAutoReserveForSales] = React.useState(true)
  const [autoReserveSerialBatch, setAutoReserveSerialBatch] = React.useState(true)

  return (
    <WorkspacePageShell
      searchPlaceholder="Search Manufacturing & BOM..."
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Stock</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-foreground">
                Stock Settings
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      actions={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-7">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Reload</DropdownMenuItem>
              <DropdownMenuItem>Customize</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" className="h-7 text-xs px-3">
            Save
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
        <Tabs defaultValue="stock-reservation" className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-primary/15 px-4 py-1 dark:border-primary/25">
            <TabsList variant="line">
              <TabsTrigger value="defaults">Defaults</TabsTrigger>
              <TabsTrigger value="stock-validations">Stock Validations</TabsTrigger>
              <TabsTrigger value="serial-batch">Serial & Batch Item</TabsTrigger>
              <TabsTrigger value="stock-reservation">Stock Reservation</TabsTrigger>
              <TabsTrigger value="quality">Quality</TabsTrigger>
              <TabsTrigger value="stock-planning">Stock Planning</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="stock-reservation" className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
            {/* Main Settings Form Content */}
            <div className="flex-1 p-6 space-y-8">
              {/* Checkboxes Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column */}
                <div className="space-y-6">
                  {/* Enable Stock Reservation */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="enableStockReservation"
                        checked={enableStockReservation}
                        onCheckedChange={(c) => setEnableStockReservation(!!c)}
                      />
                      <Label htmlFor="enableStockReservation" className="text-xs font-semibold cursor-pointer">
                        Enable Stock Reservation
                      </Label>
                    </div>
                    <p className="pl-6 text-xs text-muted-foreground leading-relaxed">
                      Allows to keep aside a specific quantity of inventory for a particular order.
                    </p>
                  </div>

                  {/* Auto Reserve Stock (Highlighted Box) */}
                  <div className="rounded-md border-2 border-red-500/80 bg-red-500/5 p-3.5 space-y-1 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="autoReserveStock"
                        checked={autoReserveStock}
                        onCheckedChange={(c) => setAutoReserveStock(!!c)}
                      />
                      <Label htmlFor="autoReserveStock" className="text-xs font-semibold cursor-pointer text-foreground">
                        Auto Reserve Stock
                      </Label>
                    </div>
                    <p className="pl-6 text-xs text-muted-foreground/90 leading-relaxed">
                      Upon submission of the Sales Order, Work Order, or Production Plan, the system will automatically reserve the stock.
                    </p>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Allow Partial Reservation */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="allowPartialReservation"
                        checked={allowPartialReservation}
                        onCheckedChange={(c) => setAllowPartialReservation(!!c)}
                      />
                      <Label htmlFor="allowPartialReservation" className="text-xs font-semibold cursor-pointer">
                        Allow Partial Reservation
                      </Label>
                    </div>
                    <p className="pl-6 text-xs text-muted-foreground leading-relaxed">
                      Partial stock can be reserved. For example, If you have a Sales Order of 100 units and the Available Stock is 90 units then a Stock Reservation Entry will be created for 90 units.
                    </p>
                  </div>

                  {/* Auto Reserve Stock for Sales Order on Purchase */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="autoReserveForSales"
                        checked={autoReserveForSales}
                        onCheckedChange={(c) => setAutoReserveForSales(!!c)}
                      />
                      <Label htmlFor="autoReserveForSales" className="text-xs font-semibold cursor-pointer">
                        Auto Reserve Stock for Sales Order on Purchase
                      </Label>
                    </div>
                    <p className="pl-6 text-xs text-muted-foreground leading-relaxed">
                      Stock will be reserved on submission of Purchase Receipt created against Material Request for Sales Order.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Serial and Batch Reservation Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Serial and Batch Reservation</h3>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="autoReserveSerialBatch"
                      checked={autoReserveSerialBatch}
                      onCheckedChange={(c) => setAutoReserveSerialBatch(!!c)}
                    />
                    <Label htmlFor="autoReserveSerialBatch" className="text-xs font-semibold cursor-pointer">
                      Auto Reserve Serial and Batch Nos
                    </Label>
                  </div>
                  <p className="pl-6 text-xs text-muted-foreground leading-relaxed">
                    Serial and Batch Nos will be auto-reserved based on Pick Serial / Batch Based On
                  </p>
                </div>
              </div>

              <Separator />

              {/* Comments Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Comments</h3>

                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      DG
                    </AvatarFallback>
                  </Avatar>
                  <div className="relative flex-1">
                    <Input
                      placeholder="Type a reply / comment"
                      className="bg-muted/20 border-muted-foreground/20 h-9 text-xs pr-10"
                    />
                    <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7 text-muted-foreground hover:text-foreground">
                      <Send className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Activity Timeline Section (shadcn Timeline / Activity) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Activity</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                    <Plus className="size-3.5 mr-1" /> New Email
                  </Button>
                </div>

                {/* Timeline list */}
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {/* Timeline Item 1 */}
                  <div className="relative flex items-start gap-2 text-xs">
                    <span className="absolute -left-6 top-1 size-2 rounded-full bg-muted-foreground/60 ring-4 ring-background" />
                    <div>
                      <p className="text-foreground">
                        <span className="font-medium">Administrator</span> created this ·
                      </p>
                    </div>
                  </div>

                  {/* Timeline Item 2 */}
                  <div className="relative flex items-start gap-2 text-xs">
                    <span className="absolute -left-6 top-1 size-2 rounded-full bg-muted-foreground/60 ring-4 ring-background" />
                    <div>
                      <p className="text-foreground">
                        <span className="font-medium">Administrator</span> last edited this ·{" "}
                        <span className="text-muted-foreground">3 months ago</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Sidebar Metadata */}
            <div className="w-full lg:w-72 border-l p-4 space-y-6 text-xs bg-muted/10">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-foreground">Stock Settings</h4>
                </div>
                <Button variant="ghost" size="icon" className="size-6">
                  <Copy className="size-3.5 text-muted-foreground" />
                </Button>
              </div>

              <Separator />

              {/* Quick Actions List */}
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
                  <p>last edited this · 3 months ago</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Administrator</p>
                  <p>created this ·</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="defaults" className="p-6 m-0 text-xs text-muted-foreground">
            Stock Defaults Settings
          </TabsContent>
          <TabsContent value="stock-validations" className="p-6 m-0 text-xs text-muted-foreground">
            Stock Validation Settings
          </TabsContent>
          <TabsContent value="serial-batch" className="p-6 m-0 text-xs text-muted-foreground">
            Serial & Batch Settings
          </TabsContent>
          <TabsContent value="quality" className="p-6 m-0 text-xs text-muted-foreground">
            Quality Inspection Settings
          </TabsContent>
          <TabsContent value="stock-planning" className="p-6 m-0 text-xs text-muted-foreground">
            Stock Planning Settings
          </TabsContent>
        </Tabs>
        </div>
      </div>
    </WorkspacePageShell>
  )
}
