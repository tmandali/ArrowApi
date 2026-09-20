import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  PlaybookEntry,
  PlaybookIndexItem,
  PlaybookLogItem,
  PlaybookScope,
  PlaybookService,
} from '@my-agent/core';
import { useAgentContext } from './agent-provider';

export interface UseAgentPlaybookOptions {
  workspaceId?: string;
  pathname?: string;
  scope?: PlaybookScope;
  autoFetch?: boolean;
  /** Özel PlaybookService verilirse Provider'daki ezilir (override) */
  customService?: PlaybookService;
}

export interface RecordRuleParams {
  title: string;
  content: string;
  targetPath?: string;
  scope?: PlaybookScope;
  author?: string;
  tags?: string[];
  id?: string;
}

export interface RecordWorkflowParams {
  title: string;
  content: string;
  targetPath?: string;
  scope?: PlaybookScope;
  author?: string;
  tags?: string[];
  id?: string;
}

export function useAgentPlaybook(options?: UseAgentPlaybookOptions) {
  const { playbookService: contextService } = useAgentContext();
  const service = options?.customService || contextService;

  const workspaceId = options?.workspaceId || 'stock';
  const pathname = options?.pathname;
  const scope = options?.scope;
  const autoFetch = options?.autoFetch !== false;

  const [entries, setEntries] = useState<PlaybookEntry[]>([]);
  const [indexItems, setIndexItems] = useState<PlaybookIndexItem[]>([]);
  const [logs, setLogs] = useState<PlaybookLogItem[]>([]);
  const [screenRules, setScreenRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const adapter = service.getAdapter();
      const allEntries = await adapter.readEntries(workspaceId, scope);
      const allIndex = await service.getIndex(workspaceId);
      const allLogs = await service.getLog(workspaceId);

      setEntries(allEntries);
      setIndexItems(allIndex);
      setLogs(allLogs);

      if (pathname) {
        const rules = await service.getScreenRules(pathname, workspaceId);
        setScreenRules(rules);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch playbook data');
    } finally {
      setLoading(false);
    }
  }, [service, workspaceId, pathname, scope]);

  useEffect(() => {
    if (autoFetch) {
      refresh();
    }
  }, [refresh, autoFetch]);

  const recordRule = useCallback(
    async (params: RecordRuleParams) => {
      const entry = await service.recordEntry({
        id: params.id,
        category: 'screen_rule',
        title: params.title,
        contentMarkdown: params.content,
        targetPath: params.targetPath || pathname,
        workspaceId,
        scope: params.scope || scope || 'workspace',
        author: params.author || 'User',
        tags: params.tags,
      });
      await refresh();
      return entry;
    },
    [service, workspaceId, pathname, scope, refresh],
  );

  const recordWorkflow = useCallback(
    async (params: RecordWorkflowParams) => {
      const entry = await service.recordEntry({
        id: params.id,
        category: 'workflow_recipe',
        title: params.title,
        contentMarkdown: params.content,
        targetPath: params.targetPath,
        workspaceId,
        scope: params.scope || scope || 'workspace',
        author: params.author || 'User',
        tags: params.tags,
      });
      await refresh();
      return entry;
    },
    [service, workspaceId, scope, refresh],
  );

  const removeRule = useCallback(
    async (id: string) => {
      const removed = await service.removeEntry(id, workspaceId);
      if (removed) {
        await refresh();
      }
      return removed;
    },
    [service, workspaceId, refresh],
  );

  const query = useCallback(
    async (task: string) => {
      const rules = await service.getScreenRules(task, workspaceId);
      const recipe = await service.findRecipe(task, workspaceId);
      return { rules, recipe };
    },
    [service, workspaceId],
  );

  return useMemo(
    () => ({
      service,
      entries,
      index: indexItems,
      log: logs,
      screenRules,
      loading,
      error,
      refresh,
      recordRule,
      recordWorkflow,
      removeRule,
      query,
    }),
    [
      service,
      entries,
      indexItems,
      logs,
      screenRules,
      loading,
      error,
      refresh,
      recordRule,
      recordWorkflow,
      removeRule,
      query,
    ],
  );
}
