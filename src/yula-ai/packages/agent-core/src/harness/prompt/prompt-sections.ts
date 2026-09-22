/**
 * System Prompt Section Construction & Prefix-Cache Diffing
 * Reference: Reference-Pi packages/coding-agent/src/core/system-prompt.ts
 */

export type SystemPromptSections = Record<string, string>;

export interface BuildPromptSectionOptions {
  /** Custom preamble establishing agent identity and core persona */
  preamble?: string;
  /** Invariant operational rules (rendered inside <rules>) */
  rules?: string[];
  /** Tool snippets or usage guidelines keyed by tool name (rendered inside <tools>) */
  tools?: Record<string, string>;
  /** Skill titles or guidelines (rendered inside <skills>) */
  skills?: string[];
  /** Procedural or playbook rules (rendered inside <playbook_rules>) */
  playbookRules?: string[];
  /** Dynamic context key-value pairs or text (rendered inside <active_context>) */
  activeContext?: Record<string, string | number | boolean | null | undefined> | string;
  /** Additional custom XML sections keyed by tag name */
  customSections?: Record<string, string>;
}

export const SYSTEM_PROMPT_SECTION_NAME = /^[a-z][a-z0-9_-]*$/;

/**
 * Normalizes input options and builds ordered, keyed prompt sections.
 */
export function buildSystemPromptSections(options: BuildPromptSectionOptions): SystemPromptSections {
  const sections: SystemPromptSections = {};

  if (options.preamble && options.preamble.trim()) {
    sections.preamble = options.preamble.trim();
  }

  if (options.rules && options.rules.length > 0) {
    const rulesList = options.rules
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => (r.startsWith('-') || r.startsWith('•') ? r : `• ${r}`));
    if (rulesList.length > 0) {
      sections.rules = rulesList.join('\n');
    }
  }

  if (options.tools && Object.keys(options.tools).length > 0) {
    const toolEntries = Object.entries(options.tools)
      .filter(([_, desc]) => Boolean(desc?.trim()))
      .map(([name, desc]) => `- ${name}: ${desc.trim()}`);
    if (toolEntries.length > 0) {
      sections.tools = toolEntries.join('\n');
    }
  }

  if (options.skills && options.skills.length > 0) {
    const skillList = options.skills.map((s) => s.trim()).filter(Boolean);
    if (skillList.length > 0) {
      sections.skills = skillList.join('\n');
    }
  }

  if (options.playbookRules && options.playbookRules.length > 0) {
    const pbList = options.playbookRules.map((p) => p.trim()).filter(Boolean);
    if (pbList.length > 0) {
      sections.playbook_rules = pbList.join('\n');
    }
  }

  if (options.activeContext) {
    if (typeof options.activeContext === 'string') {
      if (options.activeContext.trim()) {
        sections.active_context = options.activeContext.trim();
      }
    } else {
      const entries = Object.entries(options.activeContext)
        .filter(([_, val]) => val !== undefined && val !== null)
        .map(([k, val]) => `• ${k}: ${String(val)}`);
      if (entries.length > 0) {
        sections.active_context = entries.join('\n');
      }
    }
  }

  if (options.customSections) {
    for (const [name, content] of Object.entries(options.customSections)) {
      if (!SYSTEM_PROMPT_SECTION_NAME.test(name) || name === 'preamble') {
        throw new Error(`Invalid system prompt section name: ${name}`);
      }
      if (content && content.trim()) {
        sections[name] = content.trim();
      }
    }
  }

  return sections;
}

/**
 * Renders structured prompt sections into a unified prompt string.
 * Stable sections are rendered first to maximize prefix caching.
 */
export function renderPromptSections(sections: SystemPromptSections): string {
  const parts: string[] = [];

  // Preamble comes first as base untagged text
  if (sections.preamble) {
    parts.push(sections.preamble);
  }

  // Canonical prefix-caching order
  const preferredOrder = [
    'rules',
    'tools',
    'skills',
    'playbook_rules',
    'active_context',
  ];

  const processed = new Set<string>(['preamble']);

  for (const name of preferredOrder) {
    if (sections[name]) {
      parts.push(`<${name}>\n${sections[name]}\n</${name}>`);
      processed.add(name);
    }
  }

  // Append any remaining custom sections
  for (const [name, content] of Object.entries(sections)) {
    if (!processed.has(name) && content) {
      parts.push(`<${name}>\n${content}\n</${name}>`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Computes the delta patch between previous and current prompt sections.
 * Returns undefined if no sections changed.
 */
export function diffSystemPromptSections(
  previous: Record<string, string | null>,
  current: SystemPromptSections,
): Record<string, string | null> | undefined {
  const patch: Record<string, string | null> = {};
  for (const [name, text] of Object.entries(current)) {
    if (previous[name] !== text) patch[name] = text;
  }
  for (const name of Object.keys(previous)) {
    if (current[name] === undefined && previous[name] !== null) patch[name] = null;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}
