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
    const cmd = this.commands.get(cmdName);
    return cmd ? this.localizeCommand(cmd) : undefined;
  }

  getAll(): AgentCommand[] {
    return Array.from(this.commands.values()).map((c) => this.localizeCommand(c));
  }

  private localizeCommand(cmd: AgentCommand): AgentCommand {
    if (cmd.category !== 'system') return cmd;
    const dict = i18nManager.getDictionary().commands;
    const key = cmd.command.replace('/', '') as keyof typeof dict;
    if (dict[key]) {
      return { ...cmd, description: dict[key] };
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
   * Örneğin: /new, /model, /login, /compact, /help
   */
  isSystemCommand(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return false;
    const cmdName = trimmed.split(' ')[0];
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
    // ==========================================
    // 1. Pi Built-in Sistem Komutları (System)
    // ==========================================
    this.register({
      command: '/new',
      description: 'Oturumu sıfırlar ve temiz bir yeni konuşma başlatır',
      category: 'system',
    });

    this.register({
      command: '/model',
      description: 'Kullanılabilir modelleri listeler veya belirtilen modeli seçer',
      argumentHint: '[model-id (opsiyonel)]',
      category: 'system',
    });

    this.register({
      command: '/login',
      description: 'Sağlayıcı (OAuth veya API Key) kimlik doğrulama penceresini açar',
      argumentHint: '[provider (opsiyonel)]',
      category: 'system',
    });

    this.register({
      command: '/compact',
      description: 'Aktif bağlamı hemen özetleyerek sıkıştırır (Context Compaction)',
      argumentHint: '[özel talimat (opsiyonel)]',
      category: 'system',
    });

    this.register({
      command: '/help',
      description: 'Kullanılabilir tüm hazır sistem ve şablon komutlarını listeler',
      category: 'system',
    });

    // ==========================================
    // 2. İş Alanı Prompt Şablonları (Templates)
    // ==========================================
    this.register({
      command: '/rapor',
      description: 'Belirtilen mağaza ve tarih için raporu doğrudan hazırlar',
      argumentHint: '[mağaza] [tarih (opsiyonel)]',
      category: 'template',
      template: (args) => {
        const store = args[0] || 'Kadıköy';
        const date = args[1] || '2026-09';
        return `${store} mağazası için ${date} tarihli satış ve stok raporunu hazırla ve getir.`;
      },
    });

    this.register({
      command: '/sirala',
      description: 'Sonuç tablosunu artan (asc) veya azalan (desc) sırada sıralar',
      argumentHint: '[asc | desc]',
      category: 'template',
      template: (args) => {
        const dir = args[0]?.toLowerCase() === 'asc' ? 'artan' : 'azalan';
        return `Sonuç tablosunu ${dir} sırada sırala.`;
      },
    });

    this.register({
      command: '/csv',
      description: 'Sonuç verilerini CSV dosyası olarak dışa aktarır',
      category: 'template',
      template: () => 'Rapor sonuçlarını CSV dosyası olarak indir.',
    });

    this.register({
      command: '/geri',
      description: 'Rapor ekranından filtre kriterleri formuna geri döner',
      category: 'template',
      template: () => 'Sonuç ekranından filtre kriterleri ekranına geri dön.',
    });
  }
}

export const promptTemplateManager = new PromptTemplateManager();
