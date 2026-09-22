export type AgentLocale = 'tr' | 'en' | (string & {});

export interface AgentDictionary {
  commands: {
    help: string;
    model: string;
    login: string;
    provider?: string;
    compact: string;
    new: string;
    history: string;
    plan?: string;
  };
  commandAliases?: Record<string, string[]>;
  commandResponses: {
    sessionCleared: string;
    activeModel: (provider: string, model: string) => string;
    availableModelsIntro: string;
    modelHint: string;
    modelChanged: (modelId: string) => string;
    providerChanged?: (provider: string) => string;
    loginOpened: string;
    planningModeActive: (hint?: string) => string;
    helpTitle: string;
    systemActionsLabel: string;
    quickTemplatesLabel: string;
    helpRelatedTitle: (query: string) => string;
    helpRelatedHint: string;
    commandNotFound: (query: string) => string;
    commandNotFoundHint: string;
  };
  errors: {
    componentNotMounted: (id: string) => string;
    actionNotSupported: (id: string, action: string, supported: string[]) => string;
    validationFailed: (component: string, action: string, error: string) => string;
    actionRejected: (component: string) => string;
    actionFailed: (component: string, error?: string) => string;
    componentNotFound: (id: string) => string;
    undoUnavailable: string;
    redoUnavailable: string;
  };
  prompts: {
    activeComponentsIntro: string;
    componentLabel: (id: string) => string;
    descriptionLabel: string;
    supportedActionsLabel: string;
    actionLabel: (action: string) => string;
    parametersLabel: string;
    whenToCallLabel: string;
    whenNotToCallLabel: string;
  };
  status: {
    waitingUserSelection: (question: string, count: number) => string;
    factRemembered: (key: string) => string;
    factDeleted: (key: string) => string;
    undoSuccess: (label: string) => string;
    redoSuccess: (label: string) => string;
  };
}

export const trDictionary: AgentDictionary = {
  commands: {
    help: 'Kullanılabilir sistem ve beceri komutlarını listeler.',
    model: 'Aktif LLM modelini veya sağlayıcısını değiştirir (örn: /model openai:gpt-4o).',
    login: 'Sağlayıcı kimlik doğrulaması (OAuth) oturumunu açar (örn: /login github).',
    provider: 'Aktif AI model sağlayıcısını seçer veya yapılandırır (örn: /provider ollama).',
    compact: 'Konuşma geçmişini ve token bağlamını özetleyerek sıkıştırır.',
    new: 'Yeni ve temiz bir konuşma oturumu başlatır.',
    history: 'Oturum geçmişi ve dallanma kontrol noktalarını listeler.',
    plan: 'Eylemleri doğrudan koşturmak yerine onay için yol haritası (Plan) modu açar.',
  },
  commandAliases: {
    help: ['yardim', 'yardım'],
    new: ['yeni'],
  },
  commandResponses: {
    sessionCleared: '🧹 Oturum temizlendi ve yeni bir konuşma başlatıldı.',
    activeModel: (provider, model) => `⚡ **Aktif Model:** \`${provider} / ${model}\``,
    availableModelsIntro: '**Kullanılabilir Modeller:**',
    modelHint: '*Model değiştirmek için `/model <model-id>` yazabilir veya başlıktaki seçiciyi kullanabilirsiniz.*',
    modelChanged: (modelId) => `⚡ Aktif model başarıyla değiştirildi: **${modelId}**`,
    providerChanged: (provider) => `🔌 Aktif AI sağlayıcısı başarıyla değiştirildi: **${provider}**`,
    loginOpened: '🔑 Sağlayıcı kimlik doğrulama penceresi (OAuth / API Key) açıldı.',
    planningModeActive: (hint) =>
      `📋 **Planlama Modu Aktif:** Ajan eylemleri doğrudan çalıştırmayacak; önce adımları ve parametreleri içeren bir yol haritası (Plan) sunup onay isteyecektir.${hint ? `\n${hint}` : ''}`,
    helpTitle: '### 🤖 Hazır Pi Sistem ve Şablon Komutları',
    systemActionsLabel: '**Sistem Eylemleri (Yerel):**',
    quickTemplatesLabel: '**Hızlı Prompt Şablonları:**',
    helpRelatedTitle: (query) => `### 🔍 "${query}" ile İlgili Komutlar`,
    helpRelatedHint: '*Tüm komutları listelemek için `/yardim` veya `/help` yazabilirsiniz.*',
    commandNotFound: (query) => `ℹ️ **"${query}"** adında bir komut bulunamadı.`,
    commandNotFoundHint: '*Tüm komutları listelemek için `/yardim` veya `/help` yazabilirsiniz.*',
  },
  errors: {
    componentNotMounted: (id) => `Bileşen "${id}" şu an ekranda mount edilmemiş veya görünür değil.`,
    actionNotSupported: (id, action, supported) =>
      `Bileşen "${id}", "${action}" aksiyonunu desteklemiyor. Desteklenenler: ${supported.join(', ')}`,
    validationFailed: (component, action, error) =>
      `Zod Validasyon Hatası (${component}.${action}): ${error}`,
    actionRejected: (component) => `Bileşen "${component}" eylemi reddetti.`,
    actionFailed: (component, error) =>
      error || `Bileşen "${component}" eylemi başarısız oldu.`,
    componentNotFound: (id) => `[UIEventBus] Hedef bileşen bulunamadı: ${id}`,
    undoUnavailable: 'Geri alınacak daha eski bir durum bulunamadı.',
    redoUnavailable: 'İleri alınacak bir durum bulunamadı.',
  },
  prompts: {
    activeComponentsIntro:
      'Currently mounted UI components on screen that you can directly interact with, along with execution rules:',
    componentLabel: (id) => `[Component: ${id}]`,
    descriptionLabel: 'Description',
    supportedActionsLabel: 'Supported Actions',
    actionLabel: (action) => `• Action: ${action}`,
    parametersLabel: 'Parameters',
    whenToCallLabel: '✅ WHEN TO CALL',
    whenNotToCallLabel: '⛔ WHEN NOT TO CALL',
  },
  status: {
    waitingUserSelection: (question, count) =>
      `"${question}" sorusu için ${count} seçenek sunuldu.`,
    factRemembered: (key) => `"${key}" bilgisi hafızaya başarıyla kaydedildi.`,
    factDeleted: (key) => `"${key}" bilgisi hafızadan başarıyla silindi.`,
    undoSuccess: (label) => `Durum "${label}" noktasına geri alındı.`,
    redoSuccess: (label) => `Durum "${label}" noktasına ileri alındı.`,
  },
};

export const enDictionary: AgentDictionary = {
  commands: {
    help: 'Lists available system and skill slash commands.',
    model: 'Switches the active LLM model or provider (e.g. /model openai:gpt-4o).',
    login: 'Initiates provider authentication (OAuth) login (e.g. /login github).',
    provider: 'Selects or configures active AI model provider (e.g. /provider ollama).',
    compact: 'Compacts conversation history and summarizes token context.',
    new: 'Starts a brand new, clean conversation session.',
    history: 'Lists session history and checkpoint branches.',
    plan: 'Toggles plan-first mode to formulate a roadmap before executing actions.',
  },
  commandAliases: {
    help: ['help', '?'],
    new: ['new', 'clear'],
  },
  commandResponses: {
    sessionCleared: '🧹 Session cleared and brand new conversation started.',
    activeModel: (provider, model) => `⚡ **Active Model:** \`${provider} / ${model}\``,
    availableModelsIntro: '**Available Models:**',
    modelHint: '*To switch the model, write `/model <model-id>` or use the model selector in the header.*',
    modelChanged: (modelId) => `⚡ Active model successfully switched to: **${modelId}**`,
    providerChanged: (provider) => `🔌 Active AI provider successfully switched to: **${provider}**`,
    loginOpened: '🔑 Provider authentication window (OAuth / API Key) opened.',
    planningModeActive: (hint) =>
      `📋 **Plan-First Mode Active:** The agent will not execute actions directly; it will formulate a step-by-step roadmap for approval first.${hint ? `\n${hint}` : ''}`,
    helpTitle: '### 🤖 Available Pi System and Template Commands',
    systemActionsLabel: '**System Actions (Local):**',
    quickTemplatesLabel: '**Quick Prompt Templates:**',
    helpRelatedTitle: (query) => `### 🔍 Commands Related to "${query}"`,
    helpRelatedHint: '*To list all available commands, type `/help`.*',
    commandNotFound: (query) => `ℹ️ No command found matching **"${query}"**.`,
    commandNotFoundHint: '*To list all available commands, type `/help`.*',
  },
  errors: {
    componentNotMounted: (id) => `Component "${id}" is currently not mounted or visible on screen.`,
    actionNotSupported: (id, action, supported) =>
      `Component "${id}" does not support action "${action}". Supported actions: ${supported.join(', ')}`,
    validationFailed: (component, action, error) =>
      `Zod Validation Error (${component}.${action}): ${error}`,
    actionRejected: (component) => `Component "${component}" rejected the action.`,
    actionFailed: (component, error) =>
      error || `Component "${component}" action execution failed.`,
    componentNotFound: (id) => `[UIEventBus] Target component not found: ${id}`,
    undoUnavailable: 'No earlier state available to rollback to.',
    redoUnavailable: 'No next state available to redo.',
  },
  prompts: {
    activeComponentsIntro:
      'Currently mounted UI components on screen that you can directly interact with, along with execution rules:',
    componentLabel: (id) => `[Component: ${id}]`,
    descriptionLabel: 'Description',
    supportedActionsLabel: 'Supported Actions',
    actionLabel: (action) => `• Action: ${action}`,
    parametersLabel: 'Parameters',
    whenToCallLabel: '✅ WHEN TO CALL',
    whenNotToCallLabel: '⛔ WHEN NOT TO CALL',
  },
  status: {
    waitingUserSelection: (question, count) =>
      `Prompted ${count} option(s) for "${question}".`,
    factRemembered: (key) => `Fact "${key}" successfully saved to memory.`,
    factDeleted: (key) => `Fact "${key}" successfully removed from memory.`,
    undoSuccess: (label) => `State restored back to "${label}".`,
    redoSuccess: (label) => `State redone forward to "${label}".`,
  },
};

export class I18nManager {
  private currentLocale: AgentLocale = 'tr';
  private customOverrides: Partial<AgentDictionary> = {};
  private listeners: Set<(dict: AgentDictionary, locale: AgentLocale) => void> = new Set();

  constructor(defaultLocale: AgentLocale = 'tr') {
    this.currentLocale = defaultLocale;
  }

  getLocale(): AgentLocale {
    return this.currentLocale;
  }

  setLocale(locale: AgentLocale): void {
    if (this.currentLocale !== locale) {
      this.currentLocale = locale;
      this.notifyListeners();
    }
  }

  setOverrides(overrides: Partial<AgentDictionary>): void {
    this.customOverrides = overrides;
    this.notifyListeners();
  }

  getDictionary(locale?: AgentLocale): AgentDictionary {
    const targetLocale = locale || this.currentLocale;
    const base = targetLocale.toLowerCase().startsWith('en') ? enDictionary : trDictionary;

    if (Object.keys(this.customOverrides).length === 0) {
      return base;
    }

    return {
      commands: { ...base.commands, ...this.customOverrides.commands },
      commandAliases: { ...base.commandAliases, ...this.customOverrides.commandAliases },
      commandResponses: { ...base.commandResponses, ...this.customOverrides.commandResponses },
      errors: { ...base.errors, ...this.customOverrides.errors },
      prompts: { ...base.prompts, ...this.customOverrides.prompts },
      status: { ...base.status, ...this.customOverrides.status },
    };
  }

  subscribe(listener: (dict: AgentDictionary, locale: AgentLocale) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const dict = this.getDictionary();
    for (const listener of this.listeners) {
      try {
        listener(dict, this.currentLocale);
      } catch (err) {
        console.error('[I18nManager] Listener error:', err);
      }
    }
  }
}

export const i18nManager = new I18nManager('tr');
