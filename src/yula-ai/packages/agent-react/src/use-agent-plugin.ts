import { useEffect } from 'react';
import { AgentPlugin, pluginRegistry } from '@my-agent/core';

export function useAgentPlugin(plugin: AgentPlugin | null | undefined) {
  useEffect(() => {
    if (!plugin) return;

    pluginRegistry.register(plugin).catch((err) => {
      console.error(`[useAgentPlugin] ${plugin.id} kaydedilemedi:`, err);
    });

    return () => {
      pluginRegistry.unregister(plugin.id).catch((err) => {
        console.error(`[useAgentPlugin] ${plugin.id} silinemedi:`, err);
      });
    };
  }, [plugin?.id]);
}
