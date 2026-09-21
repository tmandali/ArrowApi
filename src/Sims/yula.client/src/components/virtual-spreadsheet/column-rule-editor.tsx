"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
import { Plus, X } from "lucide-react"
import { cn } from "@/utils/cn"
import {
  ConditionalColorRule,
  RULE_OPERATORS,
  RULE_COLORS,
  ruleStyleClasses,
  createColorRule,
} from "./conditional-rules"

export interface ColumnRuleEditorProps {
  column: string
  rules: ConditionalColorRule[]
  onChangeRules: (column: string, rules: ConditionalColorRule[]) => void
}

export function ColumnRuleEditor({
  column,
  rules,
  onChangeRules,
}: ColumnRuleEditorProps) {
  const t = useTranslations("GridColumns")
  const [thresholdDrafts, setThresholdDrafts] = React.useState<Record<string, string>>({})

  const updateRule = React.useCallback(
    (ruleId: string, patch: Partial<Omit<ConditionalColorRule, "id">>) => {
      onChangeRules(
        column,
        rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r))
      )
    },
    [column, rules, onChangeRules]
  )

  const removeRule = React.useCallback(
    (ruleId: string) => {
      onChangeRules(column, rules.filter((r) => r.id !== ruleId))
    },
    [column, rules, onChangeRules]
  )

  const addRule = React.useCallback(() => {
    onChangeRules(column, [...rules, createColorRule()])
  }, [column, rules, onChangeRules])

  const commitThresholdDraft = React.useCallback(
    (rule: ConditionalColorRule) => {
      const draft = thresholdDrafts[rule.id]
      if (draft == null) return
      const parsed = Number(draft.trim().replace(",", "."))
      updateRule(rule.id, { value: Number.isFinite(parsed) ? parsed : 0 })
      setThresholdDrafts((prev) => {
        const next = { ...prev }
        delete next[rule.id]
        return next
      })
    },
    [thresholdDrafts, updateRule]
  )

  return (
    <div className="ml-5 space-y-1.5 border-l-2 border-primary/30 py-1 pl-2.5 pr-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("color_rules_title")}
        </span>
        {rules.length > 0 ? (
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => onChangeRules(column, [])}
          >
            {t("clear_rules")}
          </button>
        ) : null}
      </div>
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-center gap-1">
          <select
            value={rule.op}
            onChange={(e) =>
              updateRule(rule.id, {
                op: e.target.value as ConditionalColorRule["op"],
              })
            }
            className="h-6 w-10 rounded border border-border/60 bg-background px-0.5 text-[11px]"
            aria-label={t("operator")}
          >
            {RULE_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="decimal"
            value={thresholdDrafts[rule.id] ?? String(rule.value)}
            onChange={(e) =>
              setThresholdDrafts((prev) => ({
                ...prev,
                [rule.id]: e.target.value,
              }))
            }
            onBlur={() => commitThresholdDraft(rule)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitThresholdDraft(rule)
            }}
            className="h-6 w-16 rounded border border-border/60 bg-background px-1 text-[11px] tabular-nums"
            placeholder={t("threshold")}
            aria-label={t("threshold")}
          />
          <div className="flex items-center gap-0.5">
            {RULE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={t(`color_${color}`)}
                aria-label={t(`color_${color}`)}
                onClick={() => updateRule(rule.id, { color })}
                className={cn(
                  "size-3.5 rounded-full transition-transform",
                  ruleStyleClasses(color).swatch,
                  rule.color === color
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-background scale-110"
                    : "opacity-60 hover:opacity-100"
                )}
              />
            ))}
          </div>
          <button
            type="button"
            title={t("remove_rule")}
            aria-label={t("remove_rule")}
            onClick={() => removeRule(rule.id)}
            className="flex size-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3" />
        {t("add_rule")}
      </button>
    </div>
  )
}
