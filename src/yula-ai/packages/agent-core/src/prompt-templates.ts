import { i18nManager } from './i18n';

export interface PromptTemplate {
  command: string;
  description: string;
  argumentHint?: string;
  category?: 'system' | 'template';
  template?: (args: string[]) => string;
}

export interface AgentCommand extends PromptTemplate {
  category: 'system' | 'template';
}

export function normalizeCommandToken(token: string): string {
  const t = token.startsWith('/') ? token : `/${token}`;
  return t.toLowerCase().replace(/ı/g, 'i');
}

/**
 * Pi Prompt Templates & Built-in Slash Commands
 * Reference: earendil-works/pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts (lines 2970-3075)
 */
export class PromptTemplateManager {
  private commands: Map<string, AgentCommand> = new Map();

  constructor() {
    this.registerDefaultCommands();
  }

  /**
   * Yeni bir komut kaydeder.
   */
  register(cmd: PromptTemplate | AgentCommand): void {
    const commandName = cmd.command.startsWith('/') ? cmd.command : `/${cmd.command}`;
    const category = cmd.category || 'template';
    this.commands.set(commandName, {
      ...cmd,
      command: commandName,
      category,
    });
  }

  get(command: string): AgentCommand | undefined {
    const cmdName = command.startsWith('/') ? command : `/${command}`;
    let cmd = this.commands.get(cmdName);
    if (!cmd) {
      const normalized = normalizeCommandToken(cmdName);
      cmd = this.commands.get(normalized);
      if (!cmd) {
        for (const [key, val] of this.commands.entries()) {
          if (normalizeCommandToken(key) === normalized) {
            cmd = val;
            break;
          }
        }
      }
      if (!cmd) {
        // Dynamically resolve aliases via i18nManager
        const dict = i18nManager.getDictionary();
        const bareToken = normalized.replace('/', '');
        if (dict.commandAliases) {
          for (const [canonical, aliases] of Object.entries(dict.commandAliases)) {
            if (aliases.some((a) => normalizeCommandToken(a).replace('/', '') === bareToken)) {
              cmd = this.commands.get(`/${canonical}`);
              break;
            }
          }
        }
      }
    }
    return cmd ? this.localizeCommand(cmd) : undefined;
  }

  getAll(): AgentCommand[] {
    return Array.from(this.commands.values()).map((c) => this.localizeCommand(c));
  }

  private localizeCommand(cmd: AgentCommand): AgentCommand {
    if (cmd.category !== 'system') return cmd;
    const dict = i18nManager.getDictionary();
    const rawKey = cmd.command.replace('/', '');
    let canonicalKey: keyof typeof dict.commands | undefined;

    if (rawKey in dict.commands) {
      canonicalKey = rawKey as keyof typeof dict.commands;
    } else if (dict.commandAliases) {
      const normRaw = normalizeCommandToken(rawKey).replace('/', '');
      for (const [canonical, aliases] of Object.entries(dict.commandAliases)) {
        if (aliases.some((a) => normalizeCommandToken(a).replace('/', '') === normRaw)) {
          canonicalKey = canonical as keyof typeof dict.commands;
          break;
        }
      }
    }

    if (canonicalKey && dict.commands[canonicalKey]) {
      return { ...cmd, description: dict.commands[canonicalKey]! };
    }
    return cmd;
  }

  getTemplates(): AgentCommand[] {
    return this.getAll();
  }

  getByCategory(category: 'system' | 'template'): AgentCommand[] {
    return this.getAll().filter((c) => c.category === category);
  }

  /**
   * Verilen girdinin bir sistem eylemi (Built-in System Command) olup olmadığını doğrular.
   * Örneğin: /new, /model, /login, /compact, /help, /yardim, /yardım
   */
  isSystemCommand(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return false;
    const cmdName = trimmed.split(/\s+/)[0];
    const cmd = this.get(cmdName);
    return cmd?.category === 'system';
  }

  /**
   * Şablon komutunu metne dönüştürür.
   */
  format(command: string, ...args: string[]): string {
    const cmd = this.get(command);
    if (!cmd) return command;
    if (cmd.template) return cmd.template(args);
    return command;
  }

  /**
   * Kullanıcının girdiği metin bir slash komutu ise inceler ve şablon ise metne genişletir.
   */
  resolveInput(input: string): {
    isCommand: boolean;
    isSystem: boolean;
    resolvedText: string;
    command?: string;
    args?: string[];
  } {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return { isCommand: false, isSystem: false, resolvedText: input };
    }

    const parts = trimmed.split(' ');
    const cmdName = parts[0];
    const args = parts.slice(1).filter(Boolean);

    const cmd = this.get(cmdName);
    if (!cmd) {
      return { isCommand: false, isSystem: false, resolvedText: input };
    }

    const isSystem = cmd.category === 'system';
    const resolvedText = cmd.template ? cmd.template(args) : input;

    return {
      isCommand: true,
      isSystem,
      command: cmdName,
      args,
      resolvedText,
    };
  }

  private registerDefaultCommands(): void {
    // 1. Canonical Pi Built-in System Commands (baseline descriptions)
    this.register({
      command: '/new',
      description: 'Clears the session and starts a new conversation',
      category: 'system',
    });

    this.register({
      command: '/model',
      description: 'Lists available models or switches to the specified model',
      argumentHint: '[model-id (optional)]',
      category: 'system',
    });

    this.register({
      command: '/login',
      description: 'Opens provider authentication (OAuth or API Key) modal',
      argumentHint: '[provider (optional)]',
      category: 'system',
    });

    this.register({
      command: '/compact',
      description: 'Compacts conversation history and summarizes token context',
      argumentHint: '[instructions (optional)]',
      category: 'system',
    });

    this.register({
      command: '/plan',
      description: 'Toggles plan-first mode to formulate a roadmap before executing actions',
      argumentHint: '[goal / analysis (optional)]',
      category: 'system',
    });

    this.register({
      command: '/help',
      description: 'Lists all available built-in system and template commands',
      category: 'system',
    });

    // 2. Register localized aliases dynamically from i18nManager
    const dict = i18nManager.getDictionary();
    if (dict.commandAliases) {
      for (const [canonical, aliases] of Object.entries(dict.commandAliases)) {
        const canonicalCmd = this.get(`/${canonical}`);
        for (const alias of aliases) {
          this.register({
            command: `/${alias}`,
            description: canonicalCmd?.description || canonical,
            argumentHint: canonicalCmd?.argumentHint,
            category: 'system',
          });
        }
      }
    }
  }
}

export const promptTemplateManager = new PromptTemplateManager();
