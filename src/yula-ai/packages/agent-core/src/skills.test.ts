import { describe, it, expect, beforeEach } from 'vitest';
import {
  skillsManager,
  SkillRegistry,
  validateSkillName,
  validateSkillDescription,
  normalizePath,
  matchRoutePattern,
  installSkillPolicyHook,
} from './skills';
import { HookPipeline } from './hooks';
import { agentUiTools } from './standard-tools';

describe('SkillMetadata & Progressive Disclosure (Pi Harness)', () => {
  describe('Validation Functions', () => {
    it('validates skill names correctly per Pi spec', () => {
      expect(validateSkillName('valid-skill-123')).toEqual([]);
      expect(validateSkillName('skill')).toEqual([]);

      expect(validateSkillName('')).toContain('Skill name is required.');
      expect(validateSkillName('Invalid_Name').length).toBeGreaterThan(0);
      expect(validateSkillName('-start-hyphen').length).toBeGreaterThan(0);
      expect(validateSkillName('end-hyphen-').length).toBeGreaterThan(0);
      expect(validateSkillName('consecutive--hyphens').length).toBeGreaterThan(0);
      expect(validateSkillName('a'.repeat(65)).length).toBeGreaterThan(0);
    });

    it('validates skill description length', () => {
      expect(validateSkillDescription('Short description')).toEqual([]);
      expect(validateSkillDescription('')).toContain('Skill description is required.');
      expect(validateSkillDescription('   ')).toContain('Skill description is required.');
      expect(validateSkillDescription('x'.repeat(1025)).length).toBeGreaterThan(0);
    });
  });

  describe('Route Pattern Matching', () => {
    it('normalizes paths properly', () => {
      expect(normalizePath('/reports/')).toBe('/reports');
      expect(normalizePath('reports?tab=1#details')).toBe('/reports');
      expect(normalizePath('')).toBe('/');
    });

    it('matches route wildcards and dynamic params', () => {
      expect(matchRoutePattern('*', '/any/path')).toBe(true);
      expect(matchRoutePattern('**', '/any/nested/path')).toBe(true);
      expect(matchRoutePattern('/reports', '/reports')).toBe(true);
      expect(matchRoutePattern('/reports/*', '/reports/sales')).toBe(true);
      expect(matchRoutePattern('/reports/*', '/reports/sales/nested')).toBe(false);
      expect(matchRoutePattern('/admin/**', '/admin/users/roles/5')).toBe(true);
      expect(matchRoutePattern('/orders/:orderId', '/orders/12345')).toBe(true);
    });
  });

  describe('SkillRegistry & Progressive Disclosure', () => {
    let registry: SkillRegistry;

    beforeEach(() => {
      registry = new SkillRegistry();
    });

    it('rejects registration of skills with invalid metadata', () => {
      expect(() => {
        registry.registerSkill({
          name: 'Invalid_Skill_Name',
          description: 'Valid description',
          instructions: 'Step 1',
        });
      }).toThrow(/Failed to register skill/);
    });

    it('supports progressive disclosure summary prompts without bloat', () => {
      registry.registerSkill({
        name: 'custom-export-skill',
        description: 'Guide for exporting filtered results to CSV',
        applicableRoutes: ['/reports'],
        applicableComponents: ['result_grid'],
        riskLevel: 'low',
        requiredFields: ['exportFormat'],
        instructions: 'DETAILED_LONG_INSTRUCTIONS_THAT_SHOULD_NOT_BE_IN_SUMMARY',
      });

      const summary = registry.formatSkillsSummaryPrompt('/reports', ['result_grid']);
      expect(summary).toContain('<skill name="custom-export-skill" risk_level="low">');
      expect(summary).toContain('<description>Guide for exporting filtered results to CSV</description>');
      expect(summary).toContain('<required_fields>exportFormat</required_fields>');
      expect(summary).not.toContain('DETAILED_LONG_INSTRUCTIONS_THAT_SHOULD_NOT_BE_IN_SUMMARY');

      // On-demand full retrieval
      const content = registry.formatSkillContent('custom-export-skill', 'Focus on Excel format');
      expect(content).toContain('DETAILED_LONG_INSTRUCTIONS_THAT_SHOULD_NOT_BE_IN_SUMMARY');
      expect(content).toContain('Focus on Excel format');
    });

    it('respects disableModelInvocation flag', () => {
      registry.registerSkill({
        name: 'internal-admin-tool',
        description: 'Internal hidden skill',
        disableModelInvocation: true,
        instructions: 'Secret commands',
      });

      const summary = registry.formatSkillsSummaryPrompt();
      expect(summary).not.toContain('internal-admin-tool');
      const prompt = registry.formatSkillsPrompt();
      expect(prompt).not.toContain('internal-admin-tool');
      // Still accessible directly by name
      expect(registry.getSkill('internal-admin-tool')).toBeDefined();
    });
  });

  describe('Declarative Policy Enforcement Hook', () => {
    let pipeline: HookPipeline;

    beforeEach(() => {
      pipeline = new HookPipeline();
      installSkillPolicyHook(pipeline);
    });

    it('blocks actions when requiredFields declared on skill are missing', async () => {
      skillsManager.registerSkill({
        name: 'strict-criteria-skill',
        description: 'Strict criteria enforcement',
        applicableComponents: ['criteria_form_test'],
        requiredFields: ['department', 'fiscalYear'],
        instructions: 'Instructions here',
      });

      const result = await pipeline.runBeforeHooks({
        toolName: 'dispatch_component_action',
        toolCallId: 'call_1',
        args: {
          component_id: 'criteria_form_test',
          action: 'SUBMIT',
          payload: { department: 'Finance' }, // fiscalYear missing!
        },
        activeComponents: [],
      });

      expect(result?.block).toBeDefined();
      expect(result?.block?.reason).toContain("Missing required fields [fiscalYear]");

      skillsManager.unregisterSkill('strict-criteria-skill');
    });

    it('blocks high risk / requiresApproval actions unless approved', async () => {
      skillsManager.registerSkill({
        name: 'critical-payout-skill',
        description: 'Critical payout approval',
        applicableComponents: ['payout_form_test'],
        requiresApproval: true,
        riskLevel: 'high',
        instructions: 'Instructions here',
      });

      // 1. Without approval -> Blocked
      const blockedRes = await pipeline.runBeforeHooks({
        toolName: 'dispatch_component_action',
        toolCallId: 'call_2',
        args: {
          component_id: 'payout_form_test',
          action: 'SUBMIT',
          payload: { amount: 50000 },
        },
        activeComponents: [],
      });

      expect(blockedRes?.block).toBeDefined();
      expect(blockedRes?.block?.reason).toContain('requires explicit user approval');

      // 2. With HITL approval flag -> Allowed
      const allowedRes = await pipeline.runBeforeHooks({
        toolName: 'dispatch_component_action',
        toolCallId: 'call_3',
        args: {
          component_id: 'payout_form_test',
          action: 'SUBMIT',
          payload: { amount: 50000, __hitlApproved: true },
        },
        activeComponents: [],
      });

      expect(allowedRes?.block).toBeUndefined();

      skillsManager.unregisterSkill('critical-payout-skill');
    });
  });

  describe('Standard Tool: read_skill_guide', () => {
    it('reads instructions dynamically on demand', async () => {
      const tool = agentUiTools.read_skill_guide;
      expect(tool).toBeDefined();

      const res: any = await tool.execute({ skill_name: 'form-submission-guide' });
      expect(res.success).toBe(true);
      expect(res.skill_name).toBe('form-submission-guide');
      expect(res.content).toContain('<skill name="form-submission-guide">');

      const notFound: any = await tool.execute({ skill_name: 'non-existent-skill' });
      expect(notFound.success).toBe(false);
      expect(notFound.error).toContain('not found');
    });
  });
});
