/**
 * Built-in Slash Commands Executor for useAgentChat
 * Reference: Pi Reference System Commands (/new, /model, /login, /compact, /help)
 */

import { promptTemplateManager } from '@my-agent/core';
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
  const cmd = rawCommand.startsWith('/') ? rawCommand : `/${rawCommand}`;

  if (cmd === '/new') {
    ctx.newConversation();
    ctx.appendSystemMessage('🧹 Oturum temizlendi ve yeni bir konuşma başlatıldı.');
    return true;
  }

  if (cmd === '/model') {
    if (args.length === 0) {
      const modelList = ctx.availableModels
        .map(
          (m) =>
            `- \`${m.id || m.modelId}\` (${m.provider || 'default'}${
              m.contextWindow ? ` - ${Math.round(m.contextWindow / 1000)}k` : ''
            })`
        )
        .join('\n');
      const content = `⚡ **Aktif Model:** \`${ctx.selectedProvider || 'openai'} / ${
        ctx.selectedModel || 'gpt-4o-mini'
      }\`\n\n**Kullanılabilir Modeller:**\n${modelList}\n\n*Model değiştirmek için \`/model <model-id>\` yazabilir veya başlıktaki seçiciyi kullanabilirsiniz.*`;
      ctx.appendSystemMessage(content);
      return true;
    }

    const targetModelId = args[0];
    ctx.selectModel(targetModelId);
    ctx.appendSystemMessage(`⚡ Aktif model başarıyla değiştirildi: **${targetModelId}**`);
    return true;
  }

  if (cmd === '/login') {
    ctx.onOpenLogin?.(args[0]);
    ctx.appendSystemMessage('🔑 Sağlayıcı kimlik doğrulama penceresi (OAuth / API Key) açıldı.');
    return true;
  }

  if (cmd === '/compact') {
    await ctx.compact(args.join(' '), 'manual');
    return true;
  }

  if (cmd === '/help' || cmd === '/yardim') {
    const allCmds = promptTemplateManager.getAll();
    const sysList = allCmds
      .filter((c) => c.category === 'system')
      .map((c) => `- \`${c.command}${c.argumentHint ? ' ' + c.argumentHint : ''}\`: ${c.description}`)
      .join('\n');
    const tplList = allCmds
      .filter((c) => c.category === 'template')
      .map((c) => `- \`${c.command}${c.argumentHint ? ' ' + c.argumentHint : ''}\`: ${c.description}`)
      .join('\n');

    const content = `### 🤖 Hazır Pi Sistem ve Şablon Komutları\n\n**Sistem Eylemleri (Yerel):**\n${sysList}\n\n**Hızlı Prompt Şablonları:**\n${tplList}`;
    ctx.appendSystemMessage(content);
    return true;
  }

  return false;
}
