"use client";

import React, { useMemo } from "react";
import type {
  BoundedContextContract,
  BoundedProcessTransition,
} from "@/lib/contracts/bounded-context";
import { useEffectiveBoundedContext } from "./useEffectiveBoundedContext";
import { BoundedContextActionToolbar } from "./BoundedContextActionToolbar";

export interface BoundedContextFormShellProps {
  /** The base Bounded Context contract definition */
  context: BoundedContextContract<any, any, any>;
  /** Optional active tenant country override (e.g. "TR", "DE") */
  countryCode?: string;
  /** Current state values (header entity) */
  values: Record<string, any>;
  /** Value change callback */
  onChange: (field: string, value: any) => void;
  /** Child collections data (e.g. { items: [...] }) */
  childrenData?: Record<string, any[]>;
  /** Transition callback when an action button is clicked */
  onTransition?: (toStatus: string, transition: BoundedProcessTransition) => void | Promise<void>;
  /** Optional children slots (e.g. VirtualSpreadsheet for line items) */
  children?: React.ReactNode;
  /** Optional className */
  className?: string;
}

/**
 * Universal Contract-Driven Form Shell.
 * 
 * Projects Bounded Context state and process into a fully rendered UI without
 * a single `if (country === 'TR')` or `if (status === ...)` in the view.
 */
export function BoundedContextFormShell({
  context,
  countryCode,
  values,
  onChange,
  childrenData = {},
  onTransition,
  children,
  className = "",
}: BoundedContextFormShellProps) {
  const { effectiveContext, fields, process, checkInvariants } =
    useEffectiveBoundedContext(context, { countryCode });

  // Invariant validation results
  const invariantCheck = useMemo(() => {
    return checkInvariants(values, childrenData);
  }, [checkInvariants, values, childrenData]);

  const currentStatus = values.status || process?.initialState || "Draft";

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header and Context Identity */}
      <div className="flex flex-col gap-1 border-b pb-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          {effectiveContext.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {effectiveContext.state.description}
        </p>
      </div>

      {/* Action Toolbar */}
      {process && onTransition && (
        <BoundedContextActionToolbar
          process={process}
          currentStatus={currentStatus}
          onTransition={onTransition}
        />
      )}

      {/* Invariant Violation Alert */}
      {!invariantCheck.valid && invariantCheck.errors.length > 0 && (
        <div
          className={`rounded-md border p-3 ${
            currentStatus === "Draft"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          <div className="text-xs font-semibold mb-1 flex items-center gap-1.5">
            {currentStatus === "Draft"
              ? "ℹ️ Taslak Durumu & Bütünlük Kuralları:"
              : "⚠️ Bütünlük Kuralları (Aggregate Invariants) İhlal Edildi:"}
          </div>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            {invariantCheck.errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Dynamic Header Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(fields).map(([fieldName, fieldDef]) => {
          if (typeof fieldDef === "string") return null;

          const val = values[fieldName] ?? "";
          const label = fieldDef.label || fieldDef.aliases?.[0] || fieldName;

          return (
            <div key={fieldName} className="flex flex-col gap-1.5">
              <label
                htmlFor={fieldName}
                className="text-xs font-medium text-foreground flex items-center justify-between"
              >
                <span>{label}</span>
                {fieldDef.type && (
                  <span className="text-[10px] text-muted-foreground uppercase font-mono">
                    {fieldDef.type}
                  </span>
                )}
              </label>

              {/* Enum Select */}
              {fieldDef.type === "enum" && fieldDef.enumValues ? (
                <select
                  id={fieldName}
                  value={val}
                  onChange={(e) => onChange(fieldName, e.target.value)}
                  className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 shadow-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
                >
                  <option value="">Seçiniz...</option>
                  {fieldDef.enumValues.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label} ({opt.code})
                    </option>
                  ))}
                </select>
              ) : fieldDef.type === "boolean" ? (
                <div className="flex items-center h-9">
                  <input
                    id={fieldName}
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={(e) => onChange(fieldName, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="ml-2 text-xs text-muted-foreground">
                    {fieldDef.description}
                  </span>
                </div>
              ) : (
                <input
                  id={fieldName}
                  type={
                    fieldDef.type === "number"
                      ? "number"
                      : fieldDef.type === "date"
                        ? "date"
                        : "text"
                  }
                  value={val}
                  onChange={(e) =>
                    onChange(
                      fieldName,
                      fieldDef.type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                    )
                  }
                  placeholder={fieldDef.description}
                  className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 shadow-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
                />
              )}

              {fieldDef.description && fieldDef.type !== "boolean" && (
                <span className="text-[11px] text-muted-foreground truncate">
                  {fieldDef.description}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Slot for Child Collections (e.g. Lines / VirtualSpreadsheet) */}
      {children && <div className="pt-4 border-t">{children}</div>}
    </div>
  );
}
