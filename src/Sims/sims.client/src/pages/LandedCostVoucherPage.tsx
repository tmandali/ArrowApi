import * as React from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Field,
  FieldLabel,
} from "@/components/ui/field"
import { CalendarIcon, Plus, Settings, Pencil } from "lucide-react"

export default function LandedCostVoucherPage() {
  const [postingDate, setPostingDate] = React.useState<Date | undefined>(
    new Date(2026, 6, 1)
  )
  const [vouchers, setVouchers] = React.useState([
    {
      id: 1,
      type: "Stock Entry",
      document: "",
      supplier: "",
      grandTotal: "",
    },
  ])

  const addVoucherRow = () => {
    setVouchers((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        type: "Purchase Invoice",
        document: "",
        supplier: "",
        grandTotal: "",
      },
    ])
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        {/* Sticky Header Navigation */}
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
                  <BreadcrumbLink href="#">Stock</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Landed Cost Voucher</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-semibold text-foreground flex items-center gap-2">
                    New Landed Cost Voucher
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-[10px]">
                      Not Saved
                    </Badge>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 text-xs px-4">
              Save
            </Button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Top Form Fields Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                Series <span className="text-red-500">*</span>
              </FieldLabel>
              <Select defaultValue="mat-lcv">
                <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-mono font-medium">
                  <SelectValue placeholder="Select series" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mat-lcv">MAT-LCV-.YYYY.-</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                Posting Date <span className="text-red-500">*</span>
              </FieldLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-9 justify-between text-left font-normal text-xs bg-muted/30 border-muted-foreground/20 px-2.5"
                  >
                    {postingDate ? (
                      postingDate.toLocaleDateString("en-GB").replace(/\//g, "-")
                    ) : (
                      <span>Pick a date</span>
                    )}
                    <CalendarIcon className="size-4 text-muted-foreground/60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={postingDate}
                    onSelect={setPostingDate}
                  />
                </PopoverContent>
              </Popover>
            </Field>

            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                Company <span className="text-red-500">*</span>
              </FieldLabel>
              <Input
                defaultValue="Sun Inc"
                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
              />
            </Field>
          </div>

          <Separator />

          {/* Vouchers Table Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground">Vouchers</h3>

            <div className="rounded-md border bg-card overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/40 text-xs">
                  <TableRow className="border-b hover:bg-transparent">
                    <TableHead className="w-10 text-center">
                      <Checkbox />
                    </TableHead>
                    <TableHead className="w-12">No.</TableHead>
                    <TableHead className="w-56">
                      Receipt Document Type <span className="text-red-500">*</span>
                    </TableHead>
                    <TableHead>
                      Receipt Document <span className="text-red-500">*</span>
                    </TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Grand Total</TableHead>
                    <TableHead className="w-10 text-center">
                      <Settings className="size-3.5 mx-auto text-muted-foreground" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y text-xs">
                  {vouchers.map((v, i) => (
                    <TableRow key={v.id} className="hover:bg-muted/20">
                      <TableCell className="text-center">
                        <Checkbox />
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{i + 1}</TableCell>
                      <TableCell className="p-1">
                        <Select
                          defaultValue={v.type}
                          onValueChange={(val) => {
                            setVouchers((prev) =>
                              prev.map((row) =>
                                row.id === v.id ? { ...row, type: val } : row
                              )
                            )
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs bg-muted/20 border-red-400/60 focus:ring-1 focus:ring-red-400">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Purchase Invoice">Purchase Invoice</SelectItem>
                            <SelectItem value="Purchase Receipt">Purchase Receipt</SelectItem>
                            <SelectItem value="Stock Entry" className="bg-muted/50 font-medium">
                              Stock Entry
                            </SelectItem>
                            <SelectItem value="Subcontracting Receipt" className="bg-muted/50 font-medium">
                              Subcontracting Receipt
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          placeholder="Receipt Document"
                          className="h-8 text-xs bg-background border-red-400/80 focus-visible:ring-red-400"
                        />
                      </TableCell>
                      <TableCell className="p-1 text-muted-foreground">Supplier</TableCell>
                      <TableCell className="p-1 text-right text-muted-foreground">
                        Grand Total
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground">
                          <Pencil className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={addVoucherRow}
            >
              Add row
            </Button>
          </div>

          {/* Items Section */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-foreground">Items</h3>

            <Button variant="outline" size="sm" className="h-7 text-xs px-3">
              Get Items
            </Button>

            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Receipt Items</h4>

              <div className="rounded-md border bg-card overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40 text-xs">
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="w-10 text-center">
                        <Checkbox />
                      </TableHead>
                      <TableHead className="w-12">No.</TableHead>
                      <TableHead>
                        Item Code <span className="text-red-500">*</span>
                      </TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">
                        Amount <span className="text-red-500">*</span>
                      </TableHead>
                      <TableHead className="text-right">Applicable Charges</TableHead>
                      <TableHead className="w-10 text-center">
                        <Settings className="size-3.5 mx-auto text-muted-foreground" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y text-xs">
                    <TableRow>
                      <TableCell className="text-center">
                        <Checkbox />
                      </TableCell>
                      <TableCell className="font-medium text-foreground">1</TableCell>
                      <TableCell className="text-muted-foreground"></TableCell>
                      <TableCell className="text-muted-foreground"></TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        0.000
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        $ 0.00
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        $ 0.00
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground">
                          <Pencil className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>

        <AIChatAssistant />
      </SidebarInset>
    </SidebarProvider>
  )
}
