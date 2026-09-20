/**
 * Built-in Slash Commands Executor for useAgentChat
 * Reference: Pi Reference System Commands (/new, /model, /login, /compact, /help)
 */

import { promptTemplateManager, i18nManager } from '@my-agent/core';
import type { AgentMessage } from './chat-types';

export interface CommandContext {
  availableModels: any[];
  selectedProvider?: string;
  selectedModel?: string;
  selectModel: (modelId: string, provider?: string) => void;
  newConversation: () => void;
  compact: (instructions?: string, reason?: 'threshold' | 'overflow' | 'manual') => Promise<boolean>;
  onOpenLogin?: (provider?: string) => void;
  appendSystemMessage: (content: string) => void;
}

export async function handleBuiltInCommand(
  rawCommand: string,
  args: string[],
  ctx: CommandContext
): Promise<boolean> {
  const canonical = promptTemplateManager.get(rawCommand);
  if (!canonical || canonical.category !== 'system') return false;

  const dict = i18nManager.getDictionary();
  const resp = dict.commandResponses;
  const key = canonical.command.replace('/', '');

  if (key === 'new') {
    ctx.newConversation();
    ctx.appendSystemMessage(resp.sessionCleared);
    return true;
  }

  if (key === 'model') {
    if (args.length === 0) {
      const modelList = ctx.availableModels
        .map(
          (m) =>
            `- \`${m.id || m.modelId}\` (${m.provider || 'default'}${
              m.contextWindow ? ` - ${Math.round(m.contextWindow / 1000)}k` : ''
            })`
        )
        .join('\n');
      const content = `${resp.activeModel(ctx.selectedProvider || 'openai', ctx.selectedModel || 'gpt-4o-mini')}\n\n${resp.availableModelsIntro}\n${modelList}\n\n${resp.modelHint}`;
      ctx.appendSystemMessage(content);
      return true;
    }

    const targetModelId = args[0];
    ctx.selectModel(targetModelId);
    ctx.appendSystemMessage(resp.modelChanged(targetModelId));
    return true;
  }

  if (key === 'login') {
    ctx.onOpenLogin?.(args[0]);
    ctx.appendSystemMessage(resp.loginOpened);
    return true;
  }

  if (key === 'compact') {
    await ctx.compact(args.join(' '), 'manual');
    return true;
  }

  if (key === 'plan') {
    const hint = args.length > 0 ? args.join(' ') : undefined;
    ctx.appendSystemMessage(resp.planningModeActive(hint));
    return true;
  }

  if (key === 'help') {
    const allCmds = promptTemplateManager.getAll();
    const seen = new Set<string>();
    const uniqueCmds = allCmds.filter((c) => {
      const k = c.command.toLowerCase().replace(/ı/g, 'i');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (args.length > 0) {
      const query = args.join(' ').toLowerCase().replace(/ı/g, 'i');
      const filtered = uniqueCmds.filter(
        (c) =>
          c.command.toLowerCase().replace(/ı/g, 'i').includes(query) ||
          c.description.toLowerCase().replace(/ı/g, 'i').includes(query) ||
          (c.argumentHint && c.argumentHint.toLowerCase().replace(/ı/g, 'i').includes(query))
      );

      if (filtered.length > 0) {
        const matches = filtered
          .map((c) => `- \`${c.command}${c.argumentHint ? ' ' + c.argumentHint : ''}\`: ${c.description}`)
          .join('\n');
        const content = `${resp.helpRelatedTitle(args.join(' '))}\n\n${matches}\n\n${resp.helpRelatedHint}`;
        ctx.appendSystemMessage(content);
        return true;
      }

      const available = uniqueCmds
        .filter((c) => c.category === 'system')
        .map((c) => `- \`${c.command}${c.argumentHint ? ' ' + c.argumentHint : ''}\`: ${c.description}`)
        .join('\n');
      const content = `${resp.commandNotFound(args.join(' '))}\n\n${resp.systemActionsLabel}\n${available}\n\n${resp.commandNotFoundHint}`;
      ctx.appendSystemMessage(content);
      return true;
    }

    const sysList = uniqueCmds
      .filter((c) => c.category === 'system')
      .map((c) => `- \`${c.command}${c.argumentHint ? ' ' + c.argumentHint : ''}\`: ${c.description}`)
      .join('\n');
    const tplList = uniqueCmds
      .filter((c) => c.category === 'template')
      .map((c) => `- \`${c.command}${c.argumentHint ? ' ' + c.argumentHint : ''}\`: ${c.description}`)
      .join('\n');

    const content = `${resp.helpTitle}\n\n${resp.systemActionsLabel}\n${sysList}${
      tplList ? `\n\n${resp.quickTemplatesLabel}\n${tplList}` : ''
    }`;
    ctx.appendSystemMessage(content);
    return true;
  }

  return false;
}
