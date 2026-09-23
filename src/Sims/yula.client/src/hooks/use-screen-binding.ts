"use client";

import * as React from "react";
import {
  useAgentComponent,
  type UseAgentComponentResult,
} from "@my-agent/react";
import type {
  ActionContract,
  ActionHandlersMap,
  ActionHandler,
  EventContract,
} from "@my-agent/core";
import { useScreenAgentContext } from "./use-screen-agent-context";
import {
  type ScreenContract,
  formatBoundedContextPrompt,
  resolveContextStrategy,
} from "@/lib/contracts/screen-contract";
import { useScreenJourneyStore } from "@/lib/stores/screen-journey-store";
import { useActiveScreenStore } from "@/lib/stores/active-screen-store";

export interface UseScreenBindingOptions<
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
  _TEvents extends Record<string, EventContract> = Record<string, EventContract>,
> {
  /**
   * Strongly-typed action handlers implementing the contracts declared in ScreenContract.actions.
   */
  handlers?: ActionHandlersMap<TActions>;
  /**
   * Fallback universal action handler.
   */
  onAction?: ActionHandler;
  /**
   * Bidirectional live state mirrored upstream to LLM system prompt & uiRegistry.
   */
  state?: Record<string, unknown>;
  /**
   * Callback producing the final exit snapshot when user unmounts/leaves the screen.
   */
  getExitSnapshot?: () => Record<string, unknown>;
  /**
   * Dynamic runtime metadata overriding or augmenting static contract meta.
   */
  runtimeMeta?: Record<string, unknown>;
  /**
   * Dynamic screen state (e.g. selection, rowCount, mode) passed to useScreenAgentContext.
   */
  stateExtra?: Record<string, unknown>;
  /**
   * Quick action prompts rendered for the user in the chat dock.
   */
  quickPrompts?: string[];
  /**
   * Optional next-intl translation function for resolving localized Bounded Context prompts and quick prompts.
   */
  t?: (key: string, values?: Record<string, string | number>) => string;
  /**
   * Optional country code override for jurisdiction strategy resolution (e.g. "TR", "DE").
   */
  countryCode?: string;
  /**
   * Optional custom route override for multi-screen journey logging.
   */
  route?: string;
}

/**
 * Unified single-door binding hook connecting a ScreenContract to live React DOM state,
 * bidirectional LLM mirroring, direct RPC action dispatch, active screen store, and session journey.
 */
export function useScreenBinding<
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
  TEvents extends Record<string, EventContract> = Record<string, EventContract>,
>(
  contract: ScreenContract<TActions, TEvents>,
  options: UseScreenBindingOptions<TActions, TEvents> = {},
): UseAgentComponentResult<TEvents> {
  // 1. Multi-Screen Session Journey (Mount & Exit Snapshot Tracking)
  const effectiveRoute =
    options.route ||
    (typeof window !== "undefined" ? window.location.pathname : contract.screenId);
  const latestStateRef = React.useRef(options.state);
  React.useEffect(() => {
    latestStateRef.current = options.state;
  });
  const getExitSnapshotRef = React.useRef(options.getExitSnapshot);
  React.useEffect(() => {
    getExitSnapshotRef.current = options.getExitSnapshot;
  });

  const initialPrompts = options.quickPrompts;
  React.useEffect(() => {
    useScreenJourneyStore.getState().recordScreenEnter(effectiveRoute, contract.screenTitle);
    useActiveScreenStore.getState().setScreen(contract, latestStateRef.current, initialPrompts);

    return () => {
      const snapshot = getExitSnapshotRef.current
        ? getExitSnapshotRef.current()
        : latestStateRef.current;
      useScreenJourneyStore.getState().recordScreenExit(effectiveRoute, snapshot);
      useActiveScreenStore.getState().clearScreen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRoute, contract.screenId, contract.screenTitle]);

  // Sync state and quickPrompts changes to reactive activeScreenStore
  const stateStr = JSON.stringify(options.state);
  React.useEffect(() => {
    if (options.state) {
      useActiveScreenStore.getState().updateState(options.state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateStr]);

  const promptsStr = JSON.stringify(options.quickPrompts);
  React.useEffect(() => {
    if (options.quickPrompts) {
      useActiveScreenStore.getState().setQuickPrompts(options.quickPrompts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptsStr]);

  // 2. Wrap action handlers with automatic undo history capture
  const wrappedHandlers = React.useMemo(() => {
    if (!options.handlers) return undefined;
    const wrapped: Record<string, (payload: any) => any> = {};
    for (const [actionName, handler] of Object.entries(options.handlers)) {
      wrapped[actionName] = async (payload: any) => {
        if (latestStateRef.current) {
          useActiveScreenStore.getState().updateState(latestStateRef.current, true);
        }
        return (handler as any)(payload);
      };
    }
    return wrapped as ActionHandlersMap<TActions>;
  }, [options.handlers]);

  // 3. Register with Screen Agent Context (Grid / Route store backward-compatibility)
  useScreenAgentContext({
    screenId: contract.screenId,
    screenTitle: contract.screenTitle,
    workspaceId: contract.workspace,
    quickPrompts: options.quickPrompts,
    stateExtra: {
      category: contract.category,
      aiEnabled: contract.aiEnabled,
      ...(contract.boundedContext ? { boundedContext: contract.boundedContext } : {}),
      ...options.stateExtra,
      ...(options.state ? { state: options.state } : {}),
    },
  });

  // 4. Register UI Component with @my-agent/react & uiRegistry
  const componentId = contract.screenId.includes(":")
    ? contract.screenId
    : `entity_form:${contract.screenId}`;

  const effectiveBoundedContext = React.useMemo(() => {
    if (!contract.boundedContext) return undefined;
    return resolveContextStrategy(contract.boundedContext, options.countryCode);
  }, [contract.boundedContext, options.countryCode]);

  const effectivePromptGuidelines = React.useMemo(() => {
    const list = [...(contract.promptGuidelines || [])];
    if (effectiveBoundedContext) {
      list.push(formatBoundedContextPrompt(effectiveBoundedContext, options.t));
    }
    return list;
  }, [contract.promptGuidelines, effectiveBoundedContext, options.t]);

  const sanitizedBoundedContext = React.useMemo(() => {
    if (!effectiveBoundedContext) return undefined;
    const { screen: _omitScreen, ...rest } = effectiveBoundedContext;
    return rest;
  }, [effectiveBoundedContext]);

  return useAgentComponent<TActions, TEvents>({
    id: componentId,
    actions: contract.actions,
    events: contract.events,
    handlers: wrappedHandlers,
    onAction: options.onAction,
    meta: {
      ...contract.meta,
      ...options.runtimeMeta,
      screenTitle: contract.screenTitle,
      workspace: contract.workspace,
      category: contract.category,
      promptGuidelines: effectivePromptGuidelines,
      boundedContext: sanitizedBoundedContext,
      state: options.state,
    },
  });
}
