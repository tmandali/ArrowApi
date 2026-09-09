"use client"

import * as React from "react"
import { Questionnaire as QuestionnairePrimitive } from "@shadcn/react/questionnaire"
import { cn } from "@/utils/cn"

function Questionnaire({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Root>) {
  return (
    <QuestionnairePrimitive.Root
      data-slot="questionnaire"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
}

function QuestionnaireProgress({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Progress>) {
  return (
    <QuestionnairePrimitive.Progress
      data-slot="questionnaire-progress"
      render={(progressProps, state) => (
        <div
          {...progressProps}
          className={cn(
            "flex items-center gap-2 text-xs font-medium text-muted-foreground",
            className
          )}
        >
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-in-out"
              style={{
                width: `${state.total === 0 ? 0 : (state.current / state.total) * 100}%`,
              }}
            />
          </div>
          <span className="shrink-0 tabular-nums">
            {state.current} / {state.total}
          </span>
        </div>
      )}
      {...props}
    />
  )
}

function QuestionnaireItem({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Item>) {
  return (
    <QuestionnairePrimitive.Item
      data-slot="questionnaire-item"
      className={cn("flex flex-col gap-2.5", className)}
      {...props}
    />
  )
}

function QuestionnaireTitle({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Title>) {
  return (
    <QuestionnairePrimitive.Title
      data-slot="questionnaire-title"
      className={cn(
        "text-sm font-semibold tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  )
}

function QuestionnaireDescription({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Description>) {
  return (
    <QuestionnairePrimitive.Description
      data-slot="questionnaire-description"
      className={cn("text-[13px] leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

function QuestionnaireChoices({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choices>) {
  return (
    <QuestionnairePrimitive.Choices
      data-slot="questionnaire-choices"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function QuestionnaireChoice({
  className,
  children,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choice>) {
  return (
    <QuestionnairePrimitive.Choice
      data-slot="questionnaire-choice"
      render={(choiceProps, state) => (
        <label
          {...choiceProps}
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] leading-snug transition-colors",
            state.checked
              ? "border-primary/60 bg-primary/[0.07] text-foreground"
              : "border-border/70 bg-transparent text-foreground hover:border-border hover:bg-muted/50",
            state.disabled && "cursor-not-allowed opacity-50",
            state.invalid && "border-destructive/60",
            className
          )}
        >
          <QuestionnairePrimitive.ChoiceInput
            className="mt-0.5 size-3.5 shrink-0 accent-primary"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
          {state.shortcut ? (
            <QuestionnairePrimitive.ChoiceShortcut className="ml-auto shrink-0 rounded border border-border bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">
              {state.shortcut}
            </QuestionnairePrimitive.ChoiceShortcut>
          ) : null}
        </label>
      )}
      {...props}
    />
  )
}

function QuestionnaireInput({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Input>) {
  return (
    <QuestionnairePrimitive.Input
      data-slot="questionnaire-input"
      className={cn(
        "w-full rounded-lg border border-border/70 bg-transparent px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors",
        "hover:border-border focus:border-primary/60 focus:bg-primary/[0.04]",
        className
      )}
      {...props}
    />
  )
}

function QuestionnaireError({
  className,
  children,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Error>) {
  return (
    <QuestionnairePrimitive.Error
      data-slot="questionnaire-error"
      className={cn("text-xs font-medium text-destructive", className)}
      {...props}
    >
      {children ?? "Bu soruyu cevaplayın veya atlayın."}
    </QuestionnairePrimitive.Error>
  )
}

function QuestionnaireActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="questionnaire-actions"
      className={cn("flex items-center gap-1.5 pt-1", className)}
      {...props}
    />
  )
}

const questionnaireButtonClass =
  "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-50"

function QuestionnairePrevious({
  className,
  children,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Previous>) {
  return (
    <QuestionnairePrimitive.Previous
      data-slot="questionnaire-previous"
      className={cn(
        questionnaireButtonClass,
        "border border-border/70 text-foreground hover:bg-muted/60",
        className
      )}
      {...props}
    >
      {children ?? "Geri"}
    </QuestionnairePrimitive.Previous>
  )
}

function QuestionnaireSkip({
  className,
  children,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Skip>) {
  return (
    <QuestionnairePrimitive.Skip
      data-slot="questionnaire-skip"
      className={cn(
        questionnaireButtonClass,
        "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className
      )}
      {...props}
    >
      {children ?? "Atla"}
    </QuestionnairePrimitive.Skip>
  )
}

function QuestionnaireNext({
  className,
  children,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Next>) {
  return (
    <QuestionnairePrimitive.Next
      data-slot="questionnaire-next"
      className={cn(
        questionnaireButtonClass,
        "border border-border/70 text-foreground hover:bg-muted/60",
        className
      )}
      {...props}
    >
      {children ?? "İleri"}
    </QuestionnairePrimitive.Next>
  )
}

function QuestionnaireSubmit({
  className,
  children,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Submit>) {
  return (
    <QuestionnairePrimitive.Submit
      data-slot="questionnaire-submit"
      className={cn(
        questionnaireButtonClass,
        "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
        className
      )}
      {...props}
    >
      {children ?? "Gönder"}
    </QuestionnairePrimitive.Submit>
  )
}

export {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
}
