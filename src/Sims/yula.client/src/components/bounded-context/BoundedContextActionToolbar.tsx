"use client";

import React, { useMemo } from "react";
import type {
  BoundedProcessDefinition,
  BoundedProcessTransition,
} from "@/lib/contracts/bounded-context";

export interface BoundedContextActionToolbarProps {
  /** Effective Bounded Process lifecycle state machine */
  process?: BoundedProcessDefinition;
  /** Current status of the document/entity (e.g. "Draft", "Approved") */
  currentStatus: string;
  /** Callback fired when user executes a valid lifecycle transition */
  onTransition: (toStatus: string, transition: BoundedProcessTransition) => void | Promise<void>;
  /** Whether an async transition action is currently executing */
  isProcessing?: boolean;
  /** Global disabled flag */
  disabled?: boolean;
  /** Optional className */
  className?: string;
}

/**
 * Contract-Driven Action Toolbar.
 * 
 * Computes available transition buttons purely from the Bounded Process definition.
 * ZERO hardcoded `if (status === 'Draft')` checks in the UI layer.
 */
export function BoundedContextActionToolbar({
  process,
  currentStatus,
  onTransition,
  isProcessing = false,
  disabled = false,
  className = "",
}: BoundedContextActionToolbarProps) {
  // Compute available transitions from the current state unconditionally
  const availableTransitions = useMemo(() => {
    if (!process) return [];
    return process.transitions.filter((t) => t.from === currentStatus);
  }, [process, currentStatus]);

  if (!process) {
    return null;
  }

  const currentLabel = process.statuses[currentStatus] || currentStatus;

  const isTerminal = process.terminalStates?.includes(currentStatus) || availableTransitions.length === 0;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg border border-border/60 ${className}`}>
      {/* Current Status Badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Mevcut Durum:</span>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          {currentLabel}
        </span>
        {isTerminal && (
          <span className="text-xs text-muted-foreground italic">(Kapanmış / Son Durum)</span>
        )}
      </div>

      {/* Available Lifecycle Transition Buttons */}
      <div className="flex items-center gap-2">
        {availableTransitions.map((t) => {
          const actionLabel = t.label || process.statuses[t.to] || t.to;
          const isCancelOrVoid = t.action === "cancel" || t.action === "void" || t.to.toLowerCase().includes("cancel");

          return (
            <button
              key={`${t.from}->${t.to}`}
              type="button"
              disabled={disabled || isProcessing}
              onClick={() => onTransition(t.to, t)}
              className={`inline-flex items-center justify-center text-xs font-medium px-3 py-1.5 rounded-md transition-colors shadow-xs disabled:opacity-50 disabled:pointer-events-none ${
                isCancelOrVoid
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {actionLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
