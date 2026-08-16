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

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => Promise<any> | any;
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private listeners: Set<() => void> = new Set();

  /**
   * Yeni bir AI yeteneği / aracı sisteme kaydeder.
   */
  register(tool: ToolDefinition): () => void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] "${tool.name}" aracı zaten kayıtlı, üzerine yazılıyor.`);
    }
    this.tools.set(tool.name, tool);
    this.notifyListeners();

    // Unregister fonksiyonu döndürür
    return () => {
      this.tools.delete(tool.name);
      this.notifyListeners();
    };
  }

  /**
   * Kayıtlı bir aracı ismine göre getirir.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Tüm kayıtlı araçların tanımlarını LLM şeması formatında döner.
   */
  getAllDefinitions(): Omit<ToolDefinition, "execute">[] {
    return Array.from(this.tools.values()).map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
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
      const result = await tool.execute(args);
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
