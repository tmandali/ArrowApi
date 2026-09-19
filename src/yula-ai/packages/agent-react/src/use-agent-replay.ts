import { useState, useEffect } from 'react';
import { sessionJournal, JournalEntry } from '@my-agent/core';

export function useAgentReplay() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

  const refreshEntries = () => {
    setEntries(sessionJournal.getEntries());
  };

  useEffect(() => {
    refreshEntries();
  }, []);

  const replayTo = async (targetSeq: number) => {
    setIsReplaying(true);
    try {
      await sessionJournal.replayTo(targetSeq, (_entry, index, total) => {
        setCurrentStep(index);
        setTotalSteps(total);
      });
    } finally {
      setIsReplaying(false);
      refreshEntries();
    }
  };

  const exportJSONL = (): string => {
    return sessionJournal.exportJSONL();
  };

  const importJSONL = (content: string) => {
    sessionJournal.importJSONL(content);
    refreshEntries();
  };

  const saveToStorage = () => {
    sessionJournal.saveToLocalStorage();
  };

  const loadFromStorage = () => {
    const success = sessionJournal.loadFromLocalStorage();
    if (success) refreshEntries();
    return success;
  };

  const clearJournal = () => {
    sessionJournal.clear();
    refreshEntries();
  };

  return {
    entries,
    totalCount: entries.length,
    isReplaying,
    currentStep,
    totalSteps,
    replayTo,
    exportJSONL,
    importJSONL,
    saveToStorage,
    loadFromStorage,
    clearJournal,
    refreshEntries,
  };
}
