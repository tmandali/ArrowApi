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
import type { ScreenContract } from "@/lib/contracts/screen-contract";
import { useScreenJourneyStore } from "@/lib/stores/screen-journey-store";

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
   * Optional custom route override for multi-screen journey logging.
   */
  route?: string;
}

/**
 * Unified single-door binding hook connecting a ScreenContract to live React DOM state,
 * bidirectional LLM mirroring, direct RPC action dispatch, and multi-screen session journey.
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

  React.useEffect(() => {
    useScreenJourneyStore.getState().recordScreenEnter(effectiveRoute, contract.screenTitle);
    return () => {
      const snapshot = getExitSnapshotRef.current
        ? getExitSnapshotRef.current()
        : latestStateRef.current;
      useScreenJourneyStore.getState().recordScreenExit(effectiveRoute, snapshot);
    };
  }, [effectiveRoute, contract.screenTitle]);

  // 2. Register with Screen Agent Context (Grid / Route store backward-compatibility)
  useScreenAgentContext({
    screenId: contract.screenId,
    screenTitle: contract.screenTitle,
    workspaceId: contract.workspace,
    quickPrompts: options.quickPrompts,
    stateExtra: {
      category: contract.category,
      aiEnabled: contract.aiEnabled,
      ...options.stateExtra,
      ...(options.state ? { state: options.state } : {}),
    },
  });

  // 3. Register UI Component with @my-agent/react & uiRegistry
  const componentId = contract.screenId.includes(":")
    ? contract.screenId
    : `entity_form:${contract.screenId}`;

  return useAgentComponent<TActions, TEvents>({
    id: componentId,
    actions: contract.actions,
    events: contract.events,
    handlers: options.handlers,
    onAction: options.onAction,
    meta: {
      ...contract.meta,
      ...options.runtimeMeta,
      screenTitle: contract.screenTitle,
      workspace: contract.workspace,
      category: contract.category,
      promptGuidelines: contract.promptGuidelines,
      state: options.state,
    },
  });
}
