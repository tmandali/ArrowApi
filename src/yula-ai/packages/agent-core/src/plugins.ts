import { Skill, skillsManager } from './skills';
import { hookPipeline } from './hooks';
import { BeforeToolCallHook, AfterToolCallHook } from './types';

export interface PluginContext {
  pluginId: string;
  skillsManager: typeof skillsManager;
  registerCustomTool: (name: string, toolDef: any) => void;
}

export interface AgentPlugin {
  id: string;
  name: string;
  version?: string;
  description?: string;
  skills?: Skill[];
  tools?: Record<string, any>;
  beforeToolCall?: BeforeToolCallHook;
  afterToolCall?: AfterToolCallHook;
  onInit?: (context: PluginContext) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
}

export class PluginRegistry {
  private plugins: Map<string, AgentPlugin> = new Map();
  private customTools: Map<string, any> = new Map();
  private unregisterCleanups: Map<string, (() => void)[]> = new Map();

  async register(plugin: AgentPlugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      return;
    }

    this.plugins.set(plugin.id, plugin);
    const cleanups: (() => void)[] = [];

    // 1. Yetenekleri (Skills) kaydet
    if (plugin.skills) {
      for (const skill of plugin.skills) {
        skillsManager.registerSkill(skill);
        cleanups.push(() => skillsManager.unregisterSkill(skill.name));
      }
    }

    // 2. Özel Araçları kaydet
    if (plugin.tools) {
      for (const [toolName, toolDef] of Object.entries(plugin.tools)) {
        this.customTools.set(toolName, toolDef);
        cleanups.push(() => this.customTools.delete(toolName));
      }
    }

    // 3. Yaşam döngüsü kancalarını (Hooks) bağla
    if (plugin.beforeToolCall) {
      const unsub = hookPipeline.beforeToolCall(plugin.beforeToolCall);
      cleanups.push(unsub);
    }
    if (plugin.afterToolCall) {
      const unsub = hookPipeline.afterToolCall(plugin.afterToolCall);
      cleanups.push(unsub);
    }

    // 4. Eklenti başlatma kancası
    if (plugin.onInit) {
      await plugin.onInit({
        pluginId: plugin.id,
        skillsManager,
        registerCustomTool: (name: string, def: any) => {
          this.customTools.set(name, def);
          cleanups.push(() => this.customTools.delete(name));
        },
      });
    }

    this.unregisterCleanups.set(plugin.id, cleanups);
  }

  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    if (plugin.onDestroy) {
      try {
        await plugin.onDestroy();
      } catch (err) {
        console.error(`[PluginRegistry] ${pluginId} onDestroy hatası:`, err);
      }
    }

    const cleanups = this.unregisterCleanups.get(pluginId);
    if (cleanups) {
      cleanups.forEach((c) => c());
      this.unregisterCleanups.delete(pluginId);
    }

    this.plugins.delete(pluginId);
  }

  get(pluginId: string): AgentPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  getAll(): AgentPlugin[] {
    return Array.from(this.plugins.values());
  }

  getCustomTools(): Record<string, any> {
    return Object.fromEntries(this.customTools.entries());
  }

  clear(): void {
    const ids = Array.from(this.plugins.keys());
    ids.forEach((id) => this.unregister(id));
  }
}

export const pluginRegistry = new PluginRegistry();

export function definePlugin(plugin: AgentPlugin): AgentPlugin {
  return plugin;
}
