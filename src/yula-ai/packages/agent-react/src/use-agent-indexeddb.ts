import { useState, useEffect } from 'react';
import { indexedDbDriver, StoredSessionRecord } from '@my-agent/core';

export function useAgentIndexedDB() {
  const [sessions, setSessions] = useState<StoredSessionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshList = async () => {
    setIsLoading(true);
    try {
      const list = await indexedDbDriver.listSessions();
      setSessions(list);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshList();
  }, []);

  const saveSession = async (sessionId: string, data: any) => {
    const ok = await indexedDbDriver.saveSession(sessionId, data);
    if (ok) await refreshList();
    return ok;
  };

  const loadSession = async (sessionId: string) => {
    return indexedDbDriver.loadSession(sessionId);
  };

  const deleteSession = async (sessionId: string) => {
    const ok = await indexedDbDriver.deleteSession(sessionId);
    if (ok) await refreshList();
    return ok;
  };

  return {
    sessions,
    isLoading,
    refreshList,
    saveSession,
    loadSession,
    deleteSession,
  };
}
