import { useState, useEffect } from 'react';
import { progressManager, ToolProgressUpdate } from '@my-agent/core';

export function useAgentProgress() {
  const [activeProgress, setActiveProgress] = useState<ToolProgressUpdate[]>([]);
  const [latestUpdate, setLatestUpdate] = useState<ToolProgressUpdate | null>(null);

  useEffect(() => {
    setActiveProgress(progressManager.getAllActive());

    const unsubscribe = progressManager.subscribe((update) => {
      setLatestUpdate(update);
      setActiveProgress(progressManager.getAllActive());
    });

    return () => unsubscribe();
  }, []);

  return {
    activeProgress,
    latestUpdate,
    hasActiveProgress: activeProgress.length > 0,
  };
}
