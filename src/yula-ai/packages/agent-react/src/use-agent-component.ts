'use client';

import { useEffect, useRef } from 'react';
import {
  uiEventBus,
  ActionHandler,
  uiRegistry,
  ComponentSchema,
  ActionContract,
  EventContract,
  ActionHandlersMap,
  piEventStream,
} from '@my-agent/core';

export interface UseAgentComponentOptions<
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
  TEvents extends Record<string, EventContract> = Record<string, EventContract>,
> {
  id: string;
  capabilities?: (keyof TActions & string)[] | string[];
  meta?: Record<string, any>;
  executionMode?: 'parallel' | 'sequential';
  actions?: TActions;
  events?: TEvents;
  /**
   * Code-safe, typed action handler map.
   * Keys are strongly constrained to action names declared in `actions`.
   * Input payload and return types are inferred directly from Zod action contracts.
   */
  handlers?: ActionHandlersMap<TActions>;
  /**
   * Universal action handler fallback or alternative to `handlers`.
   */
  onAction?: ActionHandler;
}

export function useAgentComponent<
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
  TEvents extends Record<string, EventContract> = Record<string, EventContract>,
>({
  id,
  capabilities,
  meta,
  executionMode,
  actions,
  events,
  handlers,
  onAction,
}: UseAgentComponentOptions<TActions, TEvents>) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const onActionRef = useRef<ActionHandler | undefined>(onAction);
  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  const effectiveCaps = capabilities?.length ? capabilities : Object.keys(actions || {});

  useEffect(() => {
    const schema: ComponentSchema = {
      id,
      capabilities: effectiveCaps as string[],
      meta,
      executionMode,
      actions,
      events,
    };

    uiRegistry.register(schema);
    piEventStream.emit({
      type: 'tool_loadout_updated',
      added: [id],
      removed: [],
    });

    // onActionRef / handlersRef üzerinden dinlenerek onAction fonksiyonunun her render'da değişmesi
    // durumunda gereksiz unregister/register churn engellenir.
    const unsubscribe = uiEventBus.subscribe(id, (action, payload) => {
      const activeHandlers = handlersRef.current;
      if (activeHandlers && action in activeHandlers) {
        const handlerFn = (activeHandlers as Record<string, (p: any) => any>)[action];
        if (typeof handlerFn === 'function') {
          return handlerFn(payload);
        }
      }
      if (onActionRef.current) {
        return onActionRef.current(action, payload);
      }
      return { status: 'unknown-action', component_id: id, action };
    });

    return () => {
      unsubscribe();
      piEventStream.emit({
        type: 'tool_loadout_updated',
        added: [],
        removed: [id],
      });
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
    JSON.stringify(events ? Object.keys(events) : []),
  ]);
}
