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
} from "@my-agent/core";
import { useScreenAgentContext } from "./use-screen-agent-context";
import type { ScreenContract } from "@/lib/contracts/screen-contract";

export interface UseScreenContractOptions<
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
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
   * Dynamic runtime metadata overriding static contract meta.
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
}

/**
 * Generic React Hook enforcing a code-safe binding between a ScreenContract
 * and live component state.
 */
export function useScreenContract<
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
>(
  contract: ScreenContract<TActions>,
  options: UseScreenContractOptions<TActions> = {},
): UseAgentComponentResult {
  // 1. Register with Screen Agent Context (Grid / Route store)
  useScreenAgentContext({
    screenId: contract.screenId,
    screenTitle: contract.screenTitle,
    workspaceId: contract.workspace,
    quickPrompts: options.quickPrompts,
    stateExtra: {
      category: contract.category,
      aiEnabled: contract.aiEnabled,
      ...options.stateExtra,
    },
  });

  // 2. Register UI Component with @my-agent/react
  const componentId = contract.screenId.includes(":")
    ? contract.screenId
    : `entity_form:${contract.screenId}`;

  return useAgentComponent<TActions>({
    id: componentId,
    actions: contract.actions,
    handlers: options.handlers,
    onAction: options.onAction,
    meta: {
      ...contract.meta,
      ...options.runtimeMeta,
      screenTitle: contract.screenTitle,
      workspace: contract.workspace,
      category: contract.category,
    },
  });
}
