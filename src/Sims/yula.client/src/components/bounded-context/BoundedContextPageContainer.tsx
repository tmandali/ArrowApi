"use client";

import React, { useState } from "react";
import type {
  BoundedContextContract,
  BoundedProcessTransition,
} from "@/lib/contracts/bounded-context";
import { validateTransition } from "@/lib/contracts/bounded-context";
import { BoundedContextFormShell } from "./BoundedContextFormShell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { GlobeIcon } from "lucide-react";

export interface BoundedContextPageContainerProps {
  /** The Bounded Context contract definition */
  context: BoundedContextContract<any, any, any>;
  /** Initial header values */
  initialValues?: Record<string, any>;
  /** Initial child collections */
  initialChildrenData?: Record<string, any[]>;
  /** Default active jurisdiction country code */
  defaultCountryCode?: string;
}

/**
 * Self-contained Page Container for any Bounded Context.
 * Manages reactive state, country jurisdiction switching, and state machine lifecycle transitions.
 */
export function BoundedContextPageContainer({
  context,
  initialValues = {},
  initialChildrenData = {},
  defaultCountryCode = "TR",
}: BoundedContextPageContainerProps) {
  const [countryCode, setCountryCode] = useState<string>(defaultCountryCode);
  const [values, setValues] = useState<Record<string, any>>(() => ({
    status: context.process?.initialState || "Draft",
    ...initialValues,
  }));
  const [childrenData, setChildrenData] = useState<Record<string, any[]>>(initialChildrenData);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleChange = (field: string, value: any) => {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAddChildRow = (collectionKey: string, childDef: any) => {
    const newRow: Record<string, any> = {};
    if (childDef.fields) {
      Object.entries(childDef.fields).forEach(([key, field]: [string, any]) => {
        newRow[key] = field.type === "number" ? 0 : "";
      });
    }
    const currentList = childrenData[collectionKey] || [];
    if ("item_code" in newRow) newRow.item_code = `ITM-00${currentList.length + 1}`;
    if ("item_name" in newRow) newRow.item_name = `Kalem ${currentList.length + 1}`;
    if ("qty" in newRow) newRow.qty = 1;
    if ("rate" in newRow) newRow.rate = 100;
    if ("amount" in newRow) newRow.amount = 100;

    const updatedList = [...currentList, newRow];
    setChildrenData((prev) => ({
      ...prev,
      [collectionKey]: updatedList,
    }));

    if (collectionKey === "items") {
      const sumAmount = updatedList.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
      const sumQty = updatedList.reduce((acc, row) => acc + (Number(row.qty) || 0), 0);
      setValues((prev) => {
        const next = { ...prev };
        if ("grand_total" in next) next.grand_total = sumAmount;
        if ("subtotal" in next) next.subtotal = sumAmount;
        if ("total_qty" in next) next.total_qty = sumQty;
        return next;
      });
    }
  };

  const handleRemoveChildRow = (collectionKey: string, index: number) => {
    const updatedList = (childrenData[collectionKey] || []).filter((_, i) => i !== index);
    setChildrenData((prev) => ({
      ...prev,
      [collectionKey]: updatedList,
    }));

    if (collectionKey === "items") {
      const sumAmount = updatedList.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
      const sumQty = updatedList.reduce((acc, row) => acc + (Number(row.qty) || 0), 0);
      setValues((prev) => {
        const next = { ...prev };
        if ("grand_total" in next) next.grand_total = sumAmount;
        if ("subtotal" in next) next.subtotal = sumAmount;
        if ("total_qty" in next) next.total_qty = sumQty;
        return next;
      });
    }
  };

  const handleUpdateChildRow = (
    collectionKey: string,
    index: number,
    field: string,
    val: any
  ) => {
    const list = [...(childrenData[collectionKey] || [])];
    const row = { ...list[index], [field]: val };
    if (field === "qty" || field === "rate") {
      const q = field === "qty" ? Number(val) || 0 : Number(row.qty) || 0;
      const r = field === "rate" ? Number(val) || 0 : Number(row.rate) || 0;
      row.amount = q * r;
    }
    list[index] = row;
    setChildrenData((prev) => ({
      ...prev,
      [collectionKey]: list,
    }));

    if (collectionKey === "items") {
      const sumAmount = list.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
      const sumQty = list.reduce((acc, r) => acc + (Number(r.qty) || 0), 0);
      setValues((prev) => {
        const next = { ...prev };
        if ("grand_total" in next) next.grand_total = sumAmount;
        if ("subtotal" in next) next.subtotal = sumAmount;
        if ("total_qty" in next) next.total_qty = sumQty;
        return next;
      });
    }
  };

  const handleTransition = (toStatus: string, _transition: BoundedProcessTransition) => {
    if (context.process) {
      const check = validateTransition(context.process, values.status, toStatus);
      if (!check.valid) {
        setStatusMessage(`Geçersiz geçiş: ${check.error}`);
        return;
      }
    }
    setValues((prev) => ({
      ...prev,
      status: toStatus,
    }));
    setStatusMessage(`Durum güncellendi: ${toStatus}`);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Top Bar with Country Jurisdiction Switcher */}
      <div className="flex items-center justify-between border-b px-6 py-2.5 bg-muted/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {context.workspace}
          </Badge>
          <span>/</span>
          <span className="font-medium text-foreground">{context.title || context.id}</span>
          {context.type && (
            <Badge variant="secondary" className="text-[10px]">
              {context.type}
            </Badge>
          )}
        </div>

        {/* Dynamic Multi-Jurisdiction Strategy Toggle */}
        {context.strategies && Object.keys(context.strategies).length > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <GlobeIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground mr-1">Mevzuat:</span>
            <div className="inline-flex rounded-md border p-0.5 bg-background shadow-xs">
              {Object.keys(context.strategies).map((cc) => (
                <button
                  key={cc}
                  type="button"
                  onClick={() => setCountryCode(cc)}
                  className={`px-2 py-0.5 text-xs font-semibold rounded transition-colors ${
                    countryCode === cc
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cc}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className="mx-6 mt-3 rounded border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-300">
          ℹ️ {statusMessage}
        </div>
      )}

      {/* Main Form Content */}
      <ScrollArea className="flex-1 p-6">
        <div className="max-w-6xl mx-auto pb-12">
          <BoundedContextFormShell
            context={context}
            countryCode={countryCode}
            values={values}
            onChange={handleChange}
            childrenData={childrenData}
            onTransition={handleTransition}
          >
            {/* Child Collections (Lines / Details) */}
            {(context.state as any)?.children &&
              Object.entries((context.state as any).children).map(([colKey, childDef]: [string, any]) => {
                const rows = childrenData[colKey] || [];
                const fieldKeys = Object.keys(childDef.fields || {});

                return (
                  <div key={colKey} className="mt-8 space-y-3 rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          {childDef.description || childDef.entityName}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {rows.length} kalem kayıtlı (Gereken asgari: {childDef.minCount ?? 0})
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddChildRow(colKey, childDef)}
                        className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        + Kalem Ekle
                      </button>
                    </div>

                    {rows.length === 0 ? (
                      <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                        Henüz kalem eklenmedi. Belgeyi onaylamak için lütfen en az{" "}
                        {childDef.minCount || 1} kalem ekleyin.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded border">
                        <table className="w-full text-xs text-left">
                          <thead className="border-b bg-muted/50 text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 w-8">#</th>
                              {fieldKeys.map((fk) => (
                                <th key={fk} className="px-3 py-2 font-medium">
                                  {childDef.fields[fk]?.label || fk}
                                </th>
                              ))}
                              <th className="px-3 py-2 text-right w-16">İşlem</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {rows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-muted/20">
                                <td className="px-3 py-2 text-muted-foreground font-mono">{idx + 1}</td>
                                {fieldKeys.map((fk) => (
                                  <td key={fk} className="px-3 py-2">
                                    <input
                                      type={
                                        childDef.fields[fk]?.type === "number" ? "number" : "text"
                                      }
                                      value={row[fk] ?? ""}
                                      onChange={(e) =>
                                        handleUpdateChildRow(colKey, idx, fk, e.target.value)
                                      }
                                      className="w-full rounded border bg-background px-2 py-1 text-xs"
                                    />
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveChildRow(colKey, idx)}
                                    className="text-destructive hover:underline text-xs"
                                  >
                                    Sil
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
          </BoundedContextFormShell>
        </div>
      </ScrollArea>
    </div>
  );
}
