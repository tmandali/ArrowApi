import { hookPipeline, HookPipeline } from './hooks';

/**
 * Skill Metadata Contract
 * Based on agentskills.io and Pi harness specification (earendil-works/pi)
 */
export interface SkillMetadata {
  /** Stable skill identifier (lowercase a-z, 0-9, single hyphens, max 64 chars) */
  name: string;
  /** Short model-visible description of when to use the skill (max 1024 chars) */
  description: string;
  /** Routes where this skill is applicable (supports wildcards '*' and '**', ':param') */
  applicableRoutes?: string[];
  /** Component IDs that must be mounted for this skill to be relevant */
  applicableComponents?: string[];
  /** Whether invoking actions under this skill requires explicit human approval (HITL) */
  requiresApproval?: boolean;
  /** Action risk classification */
  riskLevel?: 'low' | 'medium' | 'high';
  /** Fields required by this skill workflow before executing state-changing actions */
  requiredFields?: string[];
  /** Exclude this skill from model-visible listings */
  disableModelInvocation?: boolean;
  /** Custom domain or extension metadata */
  metadata?: Record<string, unknown>;
}

export interface Skill extends SkillMetadata {
  /** Full skill instructions / playbook markdown */
  instructions: string;
}

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

export function validateSkillName(name: string): string[] {
  const errors: string[] = [];
  if (!name || name.trim() === '') {
    errors.push('Skill name is required.');
    return errors;
  }
  if (name.length > MAX_NAME_LENGTH) {
    errors.push(`Skill name "${name}" exceeds ${MAX_NAME_LENGTH} characters (${name.length}).`);
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    errors.push(`Skill name "${name}" contains invalid characters (must be lowercase a-z, 0-9, hyphens only).`);
  }
  if (name.startsWith('-') || name.endsWith('-')) {
    errors.push(`Skill name "${name}" must not start or end with a hyphen.`);
  }
  if (name.includes('--')) {
    errors.push(`Skill name "${name}" must not contain consecutive hyphens.`);
  }
  return errors;
}

export function validateSkillDescription(description: string | undefined): string[] {
  const errors: string[] = [];
  if (!description || description.trim() === '') {
    errors.push('Skill description is required.');
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`Skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length}).`);
  }
  return errors;
}

/**
 * URL rota yolunu temizler:
 * 1. Query parameter (?page=2) ve Hash (#tab1) kısımlarını atar.
 * 2. Trailing slash normalizasyonu yapar (/orders/ -> /orders).
 */
export function normalizePath(path: string): string {
  if (!path) return '/';
  const clean = path.split('?')[0].split('#')[0].trim();
  const withLeading = clean.startsWith('/') ? clean : `/${clean}`;
  return withLeading.length > 1 && withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

/**
 * Gelişmiş rota kalıbı eşleştirme motoru:
 * - Query param ve hash parçalarını otomatik temizler (?sort=desc, #tab2 vb. eşleşmeyi bozmaz).
 * - '*' tekli segment jokeridir (örn: '/orders/*' -> '/orders/123').
 * - '**' çoklu segment jokeridir (örn: '/admin/**' -> '/admin/users/roles/edit/5').
 * - ':param' dinamik parametreleri yakalar (örn: '/orders/:id', '/users/:userId/orders/:orderId').
 * - '*' veya '**' global olarak tüm rotalarla eşleşir.
 */
export function matchRoutePattern(pattern: string, currentRoute: string): boolean {
  if (!pattern) return false;
  if (pattern === '*' || pattern === '**') return true;

  const cleanTarget = normalizePath(currentRoute);
  const cleanPattern = normalizePath(pattern);

  if (cleanPattern === cleanTarget) return true;

  const regexString = cleanPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§DOUBLE_WILD§§')
    .replace(/\*/g, '[^/]+')
    .replace(/§§DOUBLE_WILD§§/g, '.*')
    .replace(/:[a-zA-Z0-9_]+/g, '[^/]+');

  const regex = new RegExp(`^${regexString}$`);
  return regex.test(cleanTarget);
}

/**
 * Pi-Style Modular Skills System
 * Reference: earendil-works/pi/packages/agent/src/harness/skills.ts
 */
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  constructor() {
    this.registerDefaultSkills();
  }

  registerSkill(skill: Skill): void {
    const nameErrors = validateSkillName(skill.name);
    const descErrors = validateSkillDescription(skill.description);
    const allErrors = [...nameErrors, ...descErrors];

    if (allErrors.length > 0) {
      throw new Error(`Failed to register skill "${skill?.name}": ${allErrors.join('; ')}`);
    }

    this.skills.set(skill.name, skill);
  }

  unregisterSkill(name: string): void {
    this.skills.delete(name);
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Aktif rotaya ve ekranda mount edilmiş bileşenlere göre geçerli becerileri filtreler.
   */
  getActiveSkills(currentRoute?: string, mountedComponentIds?: string[]): Skill[] {
    return this.getAllSkills().filter((skill) => {
      if (currentRoute) {
        const matchRoute =
          !skill.applicableRoutes ||
          skill.applicableRoutes.length === 0 ||
          skill.applicableRoutes.some((pattern) => matchRoutePattern(pattern, currentRoute));
        if (!matchRoute) return false;
      }

      if (mountedComponentIds && mountedComponentIds.length > 0) {
        const matchComponent =
          !skill.applicableComponents ||
          skill.applicableComponents.length === 0 ||
          skill.applicableComponents.some((c) => mountedComponentIds.includes(c));
        if (!matchComponent) return false;
      }

      return true;
    });
  }

  /**
   * Progressive Disclosure: Sadece hafif metadata listesini LLM sistem promptuna formatlar.
   * Model detay talimatları (instructions) ihtiyaç anında dinamik olarak çağırır.
   */
  formatSkillsSummaryPrompt(currentRoute?: string, mountedComponentIds?: string[]): string {
    const active = this.getActiveSkills(currentRoute, mountedComponentIds).filter((s) => !s.disableModelInvocation);
    if (active.length === 0) return '';

    return [
      '\n<available_ui_skills>',
      'The following skill guides provide instructions for interacting with components on this screen.',
      'Use the "read_skill_guide" tool to load detailed instructions when executing one of these tasks.',
      ...active.map(
        (s) => `  <skill name="${s.name}" risk_level="${s.riskLevel || 'low'}">
    <description>${s.description}</description>${s.requiredFields && s.requiredFields.length > 0 ? `\n    <required_fields>${s.requiredFields.join(', ')}</required_fields>` : ''}${s.requiresApproval ? '\n    <requires_approval>true</requires_approval>' : ''}
  </skill>`
      ),
      '</available_ui_skills>\n',
    ].join('\n');
  }

  /**
   * Geriye uyumlu tam talimat prompt formatlayıcı.
   */
  formatSkillsPrompt(currentRoute?: string, mountedComponentIds?: string[]): string {
    const active = this.getActiveSkills(currentRoute, mountedComponentIds).filter((s) => !s.disableModelInvocation);
    if (active.length === 0) return '';

    return [
      '\n<available_ui_skills>',
      'The following skill guides provide instructions for interacting with components on this screen:',
      ...active.map(
        (s) => `
<skill name="${s.name}">
<description>${s.description}</description>
<instructions>
${s.instructions}
</instructions>
</skill>`
      ),
      '</available_ui_skills>\n',
    ].join('\n');
  }

  /**
   * Belirtilen skill için tam talimat gövdesini XML formatında döner (On-Demand / Lazy Loading).
   */
  formatSkillContent(name: string, additionalInstructions?: string): string | undefined {
    const skill = this.getSkill(name);
    if (!skill) return undefined;

    const block = `<skill name="${skill.name}">\n${skill.instructions}\n</skill>`;
    return additionalInstructions ? `${block}\n\n${additionalInstructions}` : block;
  }

  private registerDefaultSkills(): void {
    // Pure domain-agnostic UI skills
    this.registerSkill({
      name: 'form-submission-guide',
      description: 'Guidelines for validating and submitting form fields safely.',
      applicableComponents: ['filter_form', 'form', 'criteria_form'],
      riskLevel: 'medium',
      requiresApproval: false,
      instructions: `
- Before calling SUBMIT on a form component, ensure all mandatory fields are provided via SET_FIELDS.
- If mandatory parameters are missing, prompt the user or suggest valid defaults instead of dispatching SUBMIT.
`,
    });

    this.registerSkill({
      name: 'validation-recovery-guide',
      description: 'Recovery strategy when an action receives a VALIDATION_FAILED error.',
      applicableComponents: ['filter_form', 'form', 'criteria_form'],
      riskLevel: 'low',
      instructions: `
- If an action receives a VALIDATION_FAILED error, clearly explain the missing or malformed fields to the user.
- Offer safe defaults or ask for clarification before retrying.
`,
    });

    this.registerSkill({
      name: 'table-interaction-guide',
      description: 'Data table sorting, filtering, and export guidelines.',
      applicableComponents: ['result_table', 'data_grid'],
      riskLevel: 'low',
      instructions: `
- Use SORT action with direction='asc' | 'desc' to order table columns.
- Trigger EXPORT_CSV action when user requests downloading or exporting spreadsheet data.
`,
    });
  }
}

export const skillsManager = new SkillRegistry();

/**
 * Pi-Style Declarative Skill Policy Enforcement Hook
 * Automatically protects component actions using skill metadata (requiredFields, requiresApproval, riskLevel).
 */
export function installSkillPolicyHook(pipeline: HookPipeline = hookPipeline): () => void {
  return pipeline.beforeToolCall((ctx) => {
    if (ctx.toolName !== 'dispatch_component_action') return;
    const { component_id, action, payload } = ctx.args || {};
    if (!component_id) return;

    const activeSkills = skillsManager.getActiveSkills(undefined, [component_id]);
    for (const skill of activeSkills) {
      // 1. Check requiredFields
      if (skill.requiredFields && skill.requiredFields.length > 0) {
        const payloadKeys = Object.keys(payload || {});
        const missing = skill.requiredFields.filter(
          (f) => !payloadKeys.includes(f) || payload[f] === undefined || payload[f] === null || payload[f] === ''
        );
        if (missing.length > 0) {
          return {
            block: {
              reason: `Action '${action}' blocked by skill policy '${skill.name}': Missing required fields [${missing.join(', ')}]`,
              terminate: false,
            },
          };
        }
      }

      // 2. Check requiresApproval or high riskLevel
      if ((skill.requiresApproval || skill.riskLevel === 'high') && action === 'SUBMIT') {
        const isApproved = payload?._approved === true || payload?.__hitlApproved === true;
        if (!isApproved) {
          return {
            block: {
              reason: `Action '${action}' on '${component_id}' requires explicit user approval (Skill: '${skill.name}', Risk: ${skill.riskLevel || 'high'}).`,
              terminate: false,
            },
          };
        }
      }
    }
  });
}

// Auto-install policy hook into global hook pipeline
installSkillPolicyHook(hookPipeline);
