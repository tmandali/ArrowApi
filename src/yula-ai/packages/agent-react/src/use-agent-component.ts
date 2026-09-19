'use client';

import { useEffect, useRef } from 'react';
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
  const onActionRef = useRef<ActionHandler>(onAction);
  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

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

    // onActionRef üzerinden dinlenerek onAction fonksiyonunun her render'da değişmesi
    // durumunda gereksiz unregister/register churn engellenir.
    const unsubscribe = uiEventBus.subscribe(id, (action, payload) => {
      return onActionRef.current(action, payload);
    });

    return () => {
      unsubscribe();
      uiRegistry.unregister(id, schema);
    };
  }, [
    id,
    JSON.stringify(effectiveCaps),
    JSON.stringify(meta),
    executionMode,
    JSON.stringify(
      actions
        ? Object.entries(actions).map(([k, v]) => ({
            action: k,
            desc: v.description,
            when: v.whenToCall,
            whenNot: v.whenNotToCall,
          }))
        : []
    ),
  ]);
}
