import * as React from "react"
import { Label, Pie, PieChart } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { workspaceLabelFromPath } from "@/lib/empty-module"
import { cn } from "@/utils/cn"

type KpiTone = "primary" | "orange"

const kpiToneClassName: Record<KpiTone, { title: string; value: string }> = {
  primary: {
    title: "text-primary dark:text-sidebar-primary",
    value: "text-primary dark:text-sidebar-primary",
  },
  orange: {
    title: "text-orange-700 dark:text-orange-400",
    value: "text-orange-700 dark:text-orange-400",
  },
}

type KpiCard = {
  title: string
  value: string
  change: string
  tone: KpiTone
}

const kpiCardsByWorkspace: Record<string, KpiCard[]> = {
  selling: [
    {
      title: "Open Sales Orders",
      value: "24",
      change: "8 since yesterday",
      tone: "primary",
    },
    {
      title: "Invoices Due",
      value: "8",
      change: "3 due this week",
      tone: "orange",
    },
    {
      title: "Total Customers",
      value: "145",
      change: "12% since last month",
      tone: "primary",
    },
    {
      title: "Total Orders",
      value: "1.240",
      change: "18% since last month",
      tone: "orange",
    },
    {
      title: "Open Quotes",
      value: "7",
      change: "2 since yesterday",
      tone: "primary",
    },
    {
      title: "Average Order Value",
      value: "850 L",
      change: "6% since last month",
      tone: "orange",
    },
    {
      title: "Sales Target",
      value: "68%",
      change: "12% since last month",
      tone: "primary",
    },
  ],
  accounting: [
    {
      title: "Total Receivables",
      value: "1.250 L",
      change: "4% since last month",
      tone: "primary",
    },
    {
      title: "Total Payables",
      value: "860 L",
      change: "0% since last month",
      tone: "orange",
    },
    {
      title: "Net Profit",
      value: "390 L",
      change: "106% since last month",
      tone: "primary",
    },
    {
      title: "Gross Margin",
      value: "32%",
      change: "2% since last month",
      tone: "orange",
    },
    {
      title: "Cash Balance",
      value: "640 L",
      change: "8% since last month",
      tone: "primary",
    },
    {
      title: "Pending Invoices",
      value: "14",
      change: "3 since yesterday",
      tone: "orange",
    },
    {
      title: "Budget Utilization",
      value: "72%",
      change: "5% since last month",
      tone: "primary",
    },
  ],
  stock: [
    {
      title: "Total Stock Value",
      value: "3.510 L",
      change: "0% since yesterday",
      tone: "primary",
    },
    {
      title: "Total Warehouses",
      value: "5",
      change: "0% since last month",
      tone: "orange",
    },
    {
      title: "Total Active Items",
      value: "37",
      change: "106% since last month",
      tone: "primary",
    },
    {
      title: "Low Stock Items",
      value: "3",
      change: "2 since yesterday",
      tone: "orange",
    },
    {
      title: "Inbound Shipments",
      value: "9",
      change: "3 since yesterday",
      tone: "primary",
    },
    {
      title: "Outbound Shipments",
      value: "11",
      change: "4 since yesterday",
      tone: "orange",
    },
    {
      title: "Pending Stock Entries",
      value: "5",
      change: "1 since yesterday",
      tone: "primary",
    },
  ],
  manufacturing: [
    {
      title: "Active Work Orders",
      value: "12",
      change: "3 started this week",
      tone: "primary",
    },
    {
      title: "Items in Production",
      value: "45",
      change: "12% since last month",
      tone: "orange",
    },
    {
      title: "Completion Rate",
      value: "87%",
      change: "2% since yesterday",
      tone: "primary",
    },
    {
      title: "Pending Inspections",
      value: "6",
      change: "1 since yesterday",
      tone: "orange",
    },
    {
      title: "Machine Utilization",
      value: "76%",
      change: "4% since last month",
      tone: "primary",
    },
    {
      title: "On-Time Delivery",
      value: "91%",
      change: "2% since last month",
      tone: "orange",
    },
    {
      title: "Avg Production Time",
      value: "3.2 days",
      change: "0.4 since last month",
      tone: "primary",
    },
  ],
}

type PieItem = { label: string; value: number; fill: string }

const pieDataByWorkspace: Record<string, PieItem[]> = {
  selling: [
    { label: "Sales Orders", value: 275, fill: "var(--color-sales)" },
    { label: "Purchase Orders", value: 200, fill: "var(--color-purchase)" },
    { label: "Subcontracting", value: 287, fill: "var(--color-subcontracting)" },
    { label: "Deliveries", value: 173, fill: "var(--color-deliveries)" },
    { label: "Other", value: 190, fill: "var(--color-other)" },
  ],
  accounting: [
    { label: "Receivables", value: 275, fill: "var(--color-receivables)" },
    { label: "Payables", value: 200, fill: "var(--color-payables)" },
    { label: "Cash", value: 287, fill: "var(--color-cash)" },
    { label: "Investments", value: 173, fill: "var(--color-investments)" },
    { label: "Other", value: 190, fill: "var(--color-other)" },
  ],
  stock: [
    { label: "In Stock", value: 275, fill: "var(--color-instock)" },
    { label: "Reserved", value: 200, fill: "var(--color-reserved)" },
    { label: "In Transit", value: 287, fill: "var(--color-transit)" },
    { label: "Damaged", value: 173, fill: "var(--color-damaged)" },
    { label: "Other", value: 190, fill: "var(--color-other)" },
  ],
  manufacturing: [
    { label: "Completed", value: 275, fill: "var(--color-completed)" },
    { label: "In Production", value: 200, fill: "var(--color-inproduction)" },
    { label: "Planned", value: 287, fill: "var(--color-planned)" },
    { label: "Delayed", value: 173, fill: "var(--color-delayed)" },
    { label: "Other", value: 190, fill: "var(--color-other)" },
  ],
}

const pieChartConfig = {
  sales: { label: "Sales Orders", color: "var(--chart-1)" },
  purchase: { label: "Purchase Orders", color: "var(--chart-2)" },
  subcontracting: { label: "Subcontracting", color: "var(--chart-3)" },
  deliveries: { label: "Deliveries", color: "var(--chart-4)" },
  instock: { label: "In Stock", color: "var(--chart-1)" },
  reserved: { label: "Reserved", color: "var(--chart-2)" },
  transit: { label: "In Transit", color: "var(--chart-3)" },
  damaged: { label: "Damaged", color: "var(--chart-4)" },
  receivables: { label: "Receivables", color: "var(--chart-1)" },
  payables: { label: "Payables", color: "var(--chart-2)" },
  cash: { label: "Cash", color: "var(--chart-3)" },
  investments: { label: "Investments", color: "var(--chart-4)" },
  completed: { label: "Completed", color: "var(--chart-1)" },
  inproduction: { label: "In Production", color: "var(--chart-2)" },
  planned: { label: "Planned", color: "var(--chart-3)" },
  delayed: { label: "Delayed", color: "var(--chart-4)" },
  other: { label: "Other", color: "var(--chart-5)" },
} satisfies ChartConfig

function KpiToneIcon({ tone }: { tone: KpiTone }) {
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        tone === "primary"
          ? "bg-primary dark:bg-sidebar-primary"
          : "bg-orange-500 dark:bg-orange-400"
      )}
      aria-hidden
    />
  )
}

/** Transparent KPI cards + charts for the workspace landing screen. */
export function WorkspaceDashboard({ pathname }: { pathname: string }) {
  const label = workspaceLabelFromPath(pathname)
  const workspaceKey = label.toLowerCase()
  const cards = kpiCardsByWorkspace[workspaceKey] ?? kpiCardsByWorkspace.stock
  const pieData = pieDataByWorkspace[workspaceKey] ?? pieDataByWorkspace.stock

  const total = React.useMemo(
    () => pieData.reduce((acc, curr) => acc + curr.value, 0),
    [pieData]
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
      <div className="grid min-w-0 grid-cols-4 gap-3">
        {cards.map((kpi) => {
          const tone = kpiToneClassName[kpi.tone]
          return (
            <Card
              key={kpi.title}
              size="sm"
              className="bg-transparent ring-0 shadow-none"
              data-slot="kpi-card"
            >
              <CardHeader className="gap-1">
                <CardDescription className="flex items-center gap-1.5">
                  <KpiToneIcon tone={kpi.tone} />
                  <span
                    className={cn(
                      "text-[0.625rem] uppercase tracking-wide",
                      tone.title
                    )}
                  >
                    {kpi.title}
                  </span>
                </CardDescription>
                <CardTitle
                  className={cn(
                    "text-xl font-semibold tracking-tight",
                    tone.value
                  )}
                >
                  {kpi.value}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[0.625rem] text-muted-foreground">
                  {kpi.change}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <Card
          size="sm"
          className="bg-transparent ring-0 shadow-none"
          data-slot="pie-chart"
        >
          <CardHeader className="gap-1">
            <CardDescription className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary dark:bg-sidebar-primary" />
              <span className="text-[0.625rem] uppercase tracking-wide text-primary dark:text-sidebar-primary">
                Distribution
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={pieChartConfig}
              className="h-[240px] w-full min-w-0 aspect-auto"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={60}
                  strokeWidth={5}
                >
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-3xl font-bold"
                            >
                              {total.toLocaleString()}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 24}
                              className="fill-muted-foreground"
                            >
                              Records
                            </tspan>
                          </text>
                        )
                      }
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card
          size="sm"
          className="bg-transparent ring-0 shadow-none"
          data-slot="pie-legend"
        >
          <CardContent className="flex h-full flex-col justify-center gap-1.5">
            {pieData.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full")}
                  style={{ backgroundColor: item.fill }}
                />
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {item.label}
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {item.value}
                </span>
                <span className="w-12 text-right text-muted-foreground tabular-nums">
                  {Math.round((item.value / total) * 100)}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
