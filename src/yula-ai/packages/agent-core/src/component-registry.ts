import { ComponentSchema, PreflightValidationResult, IComponentRegistry } from './types';
import { i18nManager, enDictionary } from './i18n';

export class UIComponentRegistry implements IComponentRegistry {
  private registry: Map<string, ComponentSchema[]> = new Map();

  register(schema: ComponentSchema): void {
    const effectiveSchema: ComponentSchema = {
      ...schema,
      capabilities: schema.capabilities?.length ? schema.capabilities : Object.keys(schema.actions || {}),
    };
    const list = this.registry.get(schema.id) || [];
    list.push(effectiveSchema);
    this.registry.set(schema.id, list);
  }

  unregister(componentId: string, schema?: ComponentSchema): void {
    const list = this.registry.get(componentId);
    if (!list) return;
    if (schema) {
      const filtered = list.filter((s) => s !== schema);
      if (filtered.length === 0) {
        this.registry.delete(componentId);
      } else {
        this.registry.set(componentId, filtered);
      }
    } else {
      list.pop();
      if (list.length === 0) {
        this.registry.delete(componentId);
      }
    }
  }

  clear(): void {
    this.registry.clear();
  }

  get(componentId: string): ComponentSchema | undefined {
    const list = this.registry.get(componentId);
    return list && list.length > 0 ? list[list.length - 1] : undefined;
  }

  hasCapability(componentId: string, capability: string): boolean {
    const comp = this.get(componentId);
    if (!comp) return false;
    const caps = comp.capabilities || Object.keys(comp.actions || {});
    return caps.includes(capability);
  }

  getActiveComponents(): ComponentSchema[] {
    return Array.from(this.registry.values())
      .map((list) => list[list.length - 1])
      .filter((c): c is ComponentSchema => Boolean(c));
  }

  /**
   * Pi-Style Preflight Validation
   * Doğrudan DOM etkileşimi öncesi bileşenin varlığı, aksiyon kabiliyeti
   * ve varsa Zod action contract şeması ile tip/format doğruluğunu denetler.
   */
  preflightValidate(componentId: string, action: string, payload?: any): PreflightValidationResult {
    const dict = i18nManager.getDictionary().errors;
    const comp = this.get(componentId);
    if (!comp) {
      return {
        valid: false,
        error: dict.componentNotMounted(componentId),
      };
    }

    const caps = comp.capabilities || Object.keys(comp.actions || {});
    if (!caps.includes(action)) {
      return {
        valid: false,
        error: dict.actionNotSupported(componentId, action, caps),
        component: comp,
      };
    }

    // Zod Payload Doğrulaması (actions[action]?.schema)
    const schema = comp.actions?.[action]?.schema;
    if (schema && typeof schema.safeParse === 'function') {
      const parseResult = schema.safeParse(payload || {});
      if (!parseResult.success) {
        const issues = (parseResult.error as any)?.issues || (parseResult.error as any)?.errors;
        const formattedError = Array.isArray(issues) && issues.length > 0
          ? issues.map((e: any) => `${e.path?.join?.('.') || 'root'}: ${e.message}`).join('; ')
          : parseResult.error?.message || 'Geçersiz parametreler.';
        return {
          valid: false,
          error: dict.validationFailed(componentId, action, formattedError),
          component: comp,
        };
      }
    }

    return {
      valid: true,
      component: comp,
    };
  }

  /**
   * Aktif bileşenleri, aksiyonlarını, WHEN TO CALL ve WHEN NOT TO CALL
   * sınırlarını LLM sistem promptu için biçimlendirilmiş bir blok olarak üretir.
   */
  formatActiveComponentsPrompt(components?: ComponentSchema[]): string {
    const list = components || this.getActiveComponents();
    if (list.length === 0) return '';

    // LLM system prompts strictly use standard English headers to avoid context poisoning
    const pDict = enDictionary.prompts;
    const lines: string[] = [
      '<active_ui_components>',
      pDict.activeComponentsIntro,
    ];

    for (const comp of list) {
      const caps = comp.capabilities || Object.keys(comp.actions || {});
      lines.push(`\n${pDict.componentLabel(comp.id)}`);
      if (comp.meta?.description) {
        lines.push(`  ${pDict.descriptionLabel}: ${comp.meta.description}`);
      }
      lines.push(`  ${pDict.supportedActionsLabel}: ${caps.join(', ')}`);

      if (comp.actions) {
        for (const [actionName, contract] of Object.entries(comp.actions)) {
          lines.push(`  ${pDict.actionLabel(actionName)}`);
          if (contract.description) {
            lines.push(`    - ${pDict.descriptionLabel}: ${contract.description}`);
          }
          if (contract.schema && typeof contract.schema === 'object' && 'shape' in contract.schema) {
            const shapeKeys = Object.keys((contract.schema as any).shape || {});
            if (shapeKeys.length > 0) {
              lines.push(`    - ${pDict.parametersLabel || 'Parameters'}: { ${shapeKeys.join(', ')} }`);
            }
          }
          if (contract.whenToCall) {
            lines.push(`    - ${pDict.whenToCallLabel}: ${contract.whenToCall}`);
          }
          if (contract.whenNotToCall) {
            lines.push(`    - ${pDict.whenNotToCallLabel}: ${contract.whenNotToCall}`);
          }
        }
      }
    }

    lines.push('\n</active_ui_components>');
    return lines.join('\n');
  }
}

export const uiRegistry = new UIComponentRegistry();
export const formatActiveComponentsPrompt = (components?: ComponentSchema[]) =>
  uiRegistry.formatActiveComponentsPrompt(components);

