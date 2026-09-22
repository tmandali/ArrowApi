import { describe, it, expect } from 'vitest';
import {
  buildSystemPromptSections,
  renderPromptSections,
  diffSystemPromptSections,
} from './prompt-sections';

describe('Prompt Sections Architecture (Pi-Style)', () => {
  it('builds structured sections and wraps non-preamble sections in XML tags', () => {
    const sections = buildSystemPromptSections({
      preamble: 'You are an intelligent coding agent.',
      rules: ['Be concise', 'Check edge cases'],
      tools: {
        read_file: 'Read file contents from filesystem',
        run_command: 'Execute bash command',
      },
      skills: ['git-workflow: Manage commits and branches'],
      playbookRules: ['All API changes require ADR update'],
      activeContext: {
        workspace: 'ArrowApi',
        route: '/stock/balance',
      },
    });

    expect(sections.preamble).toBe('You are an intelligent coding agent.');
    expect(sections.rules).toContain('• Be concise');
    expect(sections.rules).toContain('• Check edge cases');
    expect(sections.tools).toContain('- read_file: Read file contents from filesystem');
    expect(sections.skills).toContain('git-workflow: Manage commits and branches');
    expect(sections.playbook_rules).toContain('All API changes require ADR update');
    expect(sections.active_context).toContain('• workspace: ArrowApi');
    expect(sections.active_context).toContain('• route: /stock/balance');

    const rendered = renderPromptSections(sections);
    expect(rendered.startsWith('You are an intelligent coding agent.')).toBe(true);
    expect(rendered).toContain('<rules>\n• Be concise\n• Check edge cases\n</rules>');
    expect(rendered).toContain('<tools>\n- read_file: Read file contents from filesystem\n- run_command: Execute bash command\n</tools>');
    expect(rendered).toContain('<skills>\ngit-workflow: Manage commits and branches\n</skills>');
    expect(rendered).toContain('<playbook_rules>\nAll API changes require ADR update\n</playbook_rules>');
    expect(rendered).toContain('<active_context>\n• workspace: ArrowApi\n• route: /stock/balance\n</active_context>');
  });

  it('rejects invalid XML custom section names or preamble overrides in customSections', () => {
    expect(() => {
      buildSystemPromptSections({
        customSections: {
          'Invalid Section Name': 'Content',
        },
      });
    }).toThrow(/Invalid system prompt section name/);

    expect(() => {
      buildSystemPromptSections({
        customSections: {
          preamble: 'Cannot override preamble via customSections',
        },
      });
    }).toThrow(/Invalid system prompt section name/);
  });

  it('preserves prefix-caching order in renderPromptSections', () => {
    const sections = {
      active_context: 'route: /',
      skills: 'custom-skill',
      rules: 'rule 1',
      preamble: 'Preamble',
      tools: 'tool 1',
    };

    const rendered = renderPromptSections(sections);
    const rulesIdx = rendered.indexOf('<rules>');
    const toolsIdx = rendered.indexOf('<tools>');
    const skillsIdx = rendered.indexOf('<skills>');
    const contextIdx = rendered.indexOf('<active_context>');

    expect(rulesIdx).toBeLessThan(toolsIdx);
    expect(toolsIdx).toBeLessThan(skillsIdx);
    expect(skillsIdx).toBeLessThan(contextIdx);
  });

  it('diffSystemPromptSections computes patches accurately across turns', () => {
    const prev = {
      rules: 'rule 1',
      tools: 'tool 1',
      active_context: 'route: /home',
    };

    const current = {
      rules: 'rule 1',
      tools: 'tool 1',
      active_context: 'route: /stock/balance',
      skills: 'new-skill',
    };

    const diff = diffSystemPromptSections(prev, current);
    expect(diff).toEqual({
      active_context: 'route: /stock/balance',
      skills: 'new-skill',
    });

    // When a section is removed
    const removedDiff = diffSystemPromptSections(current, {
      rules: 'rule 1',
      tools: 'tool 1',
    });
    expect(removedDiff).toEqual({
      active_context: null,
      skills: null,
    });

    // When nothing changes
    const noDiff = diffSystemPromptSections(prev, prev);
    expect(noDiff).toBeUndefined();
  });
});
