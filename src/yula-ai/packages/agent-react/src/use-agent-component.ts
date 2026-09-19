'use client';

import { useEffect } from 'react';
import { uiEventBus, ActionHandler, uiRegistry, ComponentSchema, ActionContract } from '@my-agent/core';

export interface UseAgentComponentOptions {
  id: string;
  capabilities?: string[];
  meta?: Record<string, any>;
  executionMode?: 'parallel' | 'sequential';
  actions?: Record<string, ActionContract>;
  onAction: ActionHandler;
}

export function useAgentComponent({
  id,
  capabilities,
  meta,
  executionMode,
  actions,
  onAction,
}: UseAgentComponentOptions) {
  const effectiveCaps = capabilities?.length ? capabilities : Object.keys(actions || {});

  useEffect(() => {
    const schema: ComponentSchema = {
      id,
      capabilities: effectiveCaps,
      meta,
      executionMode,
      actions,
    };
    uiRegistry.register(schema);
    const unsubscribe = uiEventBus.subscribe(id, onAction);
    return () => {
      unsubscribe();
      uiRegistry.unregister(id);
    };
  }, [id, JSON.stringify(effectiveCaps), JSON.stringify(meta), executionMode, JSON.stringify(Object.keys(actions || {})), onAction]);
}
