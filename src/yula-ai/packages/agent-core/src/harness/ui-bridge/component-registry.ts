import { ComponentSchema, PreflightValidationResult, IComponentRegistry } from '../../types';
import { i18nManager, enDictionary } from '../extensions/i18n';

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
   * Backward-compatible alias for getActiveComponents.
   */
  getAll(): ComponentSchema[] {
    return this.getActiveComponents();
  }

  /**
   * Pi-Style Preflight Validation
   * Doğrudan DOM etkileşimi öncesi bileşenin varlığı, aksiyon kabiliyeti
   * ve varsa Zod action contract şeması ile tip/format doğruluğunu denetler.
   */
  preflightValidate(componentId: string, action: string, payload?: any, context?: any): PreflightValidationResult {
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

    // Deterministik when koşul doğrulaması
    const contract = comp.actions?.[action];
    if (contract?.when) {
      if (contract.when.phase && context?.phase && contract.when.phase !== context.phase) {
        return {
          valid: false,
          error: `Action "${action}" requires screen phase "${contract.when.phase}", but current phase is "${context.phase}".`,
          component: comp,
        };
      }
      if (contract.when.predicate && typeof contract.when.predicate === 'function' && !contract.when.predicate(context)) {
        return {
          valid: false,
          error: `Action "${action}" conditions are not met for the current context.`,
          component: comp,
        };
      }
    }

    // Zod Payload Doğrulaması (inputSchema || schema)
    const schema = contract?.inputSchema || contract?.schema;
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
   * Aksiyon tamamlandığında dönen çıktıyı outputSchema'ya göre doğrular.
   */
  postflightValidate(componentId: string, action: string, output?: any): { valid: boolean; error?: string } {
    const comp = this.get(componentId);
    const contract = comp?.actions?.[action];
    const outputSchema = contract?.outputSchema;

    if (outputSchema && typeof outputSchema.safeParse === 'function') {
      const res = outputSchema.safeParse(output ?? {});
      if (!res.success) {
        const issues = (res.error as any)?.issues || (res.error as any)?.errors;
        const formattedError = Array.isArray(issues) && issues.length > 0
          ? issues.map((e: any) => `${e.path?.join?.('.') || 'root'}: ${e.message}`).join('; ')
          : res.error?.message || 'Geçersiz çıktı nesnesi.';
        return {
          valid: false,
          error: `Output validation failed for ${componentId}.${action}: ${formattedError}`,
        };
      }
    }

    return { valid: true };
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
          const inSchema = contract.inputSchema || contract.schema;
          if (inSchema && typeof inSchema === 'object' && 'shape' in inSchema) {
            const shapeKeys = Object.keys((inSchema as any).shape || {});
            if (shapeKeys.length > 0) {
              lines.push(`    - ${pDict.parametersLabel || 'Parameters'}: { ${shapeKeys.join(', ')} }`);
            }
          }
          if (contract.outputSchema && typeof contract.outputSchema === 'object' && 'shape' in contract.outputSchema) {
            const outShapeKeys = Object.keys((contract.outputSchema as any).shape || {});
            if (outShapeKeys.length > 0) {
              lines.push(`    - Returns: { ${outShapeKeys.join(', ')} }`);
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

      if (comp.events && Object.keys(comp.events).length > 0) {
        lines.push(`  Emitted Events: ${Object.keys(comp.events).join(', ')}`);
        for (const [eventName, eventContract] of Object.entries(comp.events)) {
          if (eventContract.description) {
            lines.push(`    - Event [${eventName}]: ${eventContract.description}`);
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

