/**
 * Sims AI Skill / Tool Registry
 * 
 * Frontend üzerinde tanımlanan ve Python Sidecar / LLM tarafından çağrılabilen
 * tüm araçların merkezi kayıt ve yürütme mekanizmasıdır.
 */

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[];
  required?: boolean;
}

export type ToolScopeType = "global" | "workspace" | "screen";

export interface ToolScope {
  type: ToolScopeType;
  id?: string; // örn: workspaceId ("stock") veya screenId ("stock-report")
}

export interface ToolDefinition {
  name: string;
  description: string;
  scope?: ToolScope;
  /** Skill köprüsünden kaydedilen araçlar: state-driven viewing guard'ından muaftır. */
  skill?: boolean;
  ai?: {
    aliases?: string[];
    quickPrompts?: string[];
  };
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => Promise<any> | any;
}

class ToolRegistry {
  private tools: Map<string, { definition: ToolDefinition; registrationId: symbol }> = new Map();
  private listeners: Set<() => void> = new Set();

  /**
   * Yeni bir AI yeteneği / aracı sisteme kaydeder.
   */
  register(tool: ToolDefinition): () => void {
    const registrationId = Symbol(tool.name);
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] "${tool.name}" aracı zaten kayıtlı, üzerine yazılıyor.`);
    }
    this.tools.set(tool.name, { definition: tool, registrationId });
    this.notifyListeners();

    // Unregister fonksiyonu döndürür
    return () => {
      const registered = this.tools.get(tool.name);
      if (registered?.registrationId === registrationId) {
        this.tools.delete(tool.name);
        this.notifyListeners();
      }
    };
  }

  /**
   * Kayıtlı bir aracı ismine göre getirir.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  /**
   * Tüm kayıtlı araçları döner.
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values(), ({ definition }) => definition);
  }

  /**
   * Aktif workspace ve aktif ekrana göre filtrelenmiş ve önceliklendirilmiş araçları döner.
   * Öncelik Sırası: Screen Scope > Workspace Scope > Global Scope
   */
  getScopedTools(workspaceId?: string, screenId?: string): ToolDefinition[] {
    const all = this.getAll();
    
    return all.filter((tool) => {
      if (!tool.scope || tool.scope.type === "global") {
        return true;
      }
      if (tool.scope.type === "workspace") {
        return !tool.scope.id || tool.scope.id === workspaceId;
      }
      if (tool.scope.type === "screen") {
        return !tool.scope.id || tool.scope.id === screenId;
      }
      return true;
    }).sort((a, b) => {
      const order = { screen: 3, workspace: 2, global: 1 };
      const aScore = order[a.scope?.type || "global"] || 1;
      const bScore = order[b.scope?.type || "global"] || 1;
      return bScore - aScore; // Screen tools first
    });
  }

  /**
   * Belirli bir kapsam için LLM şeması formatında araç tanımlarını döner.
   */
  getScopedDefinitions(workspaceId?: string, screenId?: string): Omit<ToolDefinition, "execute">[] {
    return this.getScopedTools(workspaceId, screenId).map(({ name, description, parameters, scope, ai }) => ({
      name,
      description,
      parameters,
      scope,
      ai,
    }));
  }

  /**
   * Tüm kayıtlı araçların tanımlarını LLM şeması formatında döner.
   */
  getAllDefinitions(): Omit<ToolDefinition, "execute">[] {
    return this.getAll().map(({ name, description, parameters, scope, ai }) => ({
      name,
      description,
      parameters,
      scope,
      ai,
    }));
  }

  /**
   * Gelen bir Tool Call isteğini ilgili araç fonksiyonuna yönlendirip çalıştırır.
   */
  async executeTool(name: string, args: Record<string, any>): Promise<{ success: boolean; result?: any; error?: string }> {
    const tool = this.tools.get(name);
    if (!tool) {
      const errorMsg = `[ToolRegistry] Hata: "${name}" adında bir araç bulunamadı.`;
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    try {
      console.log(`[ToolRegistry] "${name}" aracı çalıştırılıyor. Argümanlar:`, args);
      const result = await tool.definition.execute(args);
      return { success: true, result };
    } catch (err: any) {
      console.error(`[ToolRegistry] "${name}" aracı çalıştırılırken hata:`, err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }
}

export const toolRegistry = new ToolRegistry();
