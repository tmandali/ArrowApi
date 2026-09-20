import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  AgentLocale,
  AgentDictionary,
  i18nManager,
} from '@my-agent/core';

export interface AgentContextType {
  apiEndpoint: string;
  modelsEndpoint?: string;
  systemName?: string;
  locale: AgentLocale;
  dictionary: AgentDictionary;
  setLocale: (locale: AgentLocale) => void;
}

const AgentContext = createContext<AgentContextType | null>(null);

export function AgentProvider({
  children,
  apiEndpoint = '/api/agent/chat',
  modelsEndpoint = '/api/agent/models',
  systemName = 'DefaultSystem',
  locale = 'tr',
  messages,
}: {
  children: React.ReactNode;
  apiEndpoint?: string;
  modelsEndpoint?: string;
  systemName?: string;
  locale?: AgentLocale;
  messages?: Partial<AgentDictionary>;
}) {
  const [currentLocale, setCurrentLocale] = useState<AgentLocale>(() => {
    if (locale) i18nManager.setLocale(locale);
    if (messages) i18nManager.setOverrides(messages);
    return i18nManager.getLocale();
  });
  const [dictionary, setDictionary] = useState<AgentDictionary>(() => i18nManager.getDictionary());

  useEffect(() => {
    if (locale) i18nManager.setLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (messages) i18nManager.setOverrides(messages);
  }, [messages]);

  useEffect(() => {
    const unsub = i18nManager.subscribe((dict, loc) => {
      setDictionary(dict);
      setCurrentLocale(loc);
    });
    return unsub;
  }, []);

  const handleSetLocale = (loc: AgentLocale) => {
    i18nManager.setLocale(loc);
  };

  return (
    <AgentContext.Provider
      value={{
        apiEndpoint,
        modelsEndpoint,
        systemName,
        locale: currentLocale,
        dictionary,
        setLocale: handleSetLocale,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgentContext(): AgentContextType {
  const context = useContext(AgentContext);
  if (context) return context;
  return {
    apiEndpoint: '/api/agent/chat',
    modelsEndpoint: '/api/agent/models',
    systemName: 'DefaultSystem',
    locale: i18nManager.getLocale(),
    dictionary: i18nManager.getDictionary(),
    setLocale: (loc) => i18nManager.setLocale(loc),
  };
}
