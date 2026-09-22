import { describe, it, expect } from 'vitest';
import { promptTemplateManager } from './prompt-templates';

describe('Built-in Commands & Slash System (Pi Reference)', () => {
  it('/new, /model, /login, /compact, /help sistem komutları olarak kayıtlı olmalıdır', () => {
    const sysCommands = promptTemplateManager.getByCategory('system');
    const cmdNames = sysCommands.map((c) => c.command);

    expect(cmdNames).toContain('/new');
    expect(cmdNames).toContain('/yeni');
    expect(cmdNames).toContain('/model');
    expect(cmdNames).toContain('/login');
    expect(cmdNames).toContain('/provider');
    expect(cmdNames).toContain('/compact');
    expect(cmdNames).toContain('/plan');
    expect(cmdNames).toContain('/help');
    expect(cmdNames).toContain('/yardim');
    expect(cmdNames).toContain('/yardım');
  });

  it('isSystemCommand sistem komutlarını doğru tespit etmelidir', () => {
    expect(promptTemplateManager.isSystemCommand('/new')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/yeni')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/model gpt-4o')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/login google')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/provider')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/provider azure')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/provider ollama')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/compact')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/plan')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/help')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/yardim')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/yardım')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/YARDIM')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/yardım skil create')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/yardim skil create')).toBe(true);

    // Bilinmeyen veya normal metinler sistem komutu sayılmamalı
    expect(promptTemplateManager.isSystemCommand('/unknown')).toBe(false);
    expect(promptTemplateManager.isSystemCommand('normal bir mesaj')).toBe(false);
  });

  it('resolveInput sistem komutları ve özel şablonları doğru işlemelidir', () => {
    const resolvedModel = promptTemplateManager.resolveInput('/model claude-3-5-sonnet');
    expect(resolvedModel.isCommand).toBe(true);
    expect(resolvedModel.isSystem).toBe(true);
    expect(resolvedModel.command).toBe('/model');
    expect(resolvedModel.args).toEqual(['claude-3-5-sonnet']);

    const resolvedProvider = promptTemplateManager.resolveInput('/provider azure');
    expect(resolvedProvider.isCommand).toBe(true);
    expect(resolvedProvider.isSystem).toBe(true);
    expect(resolvedProvider.command).toBe('/provider');
    expect(resolvedProvider.args).toEqual(['azure']);

    // Dinamik şablon kaydı testi
    promptTemplateManager.register({
      command: '/custom-tpl',
      description: 'Özel test şablonu',
      category: 'template',
      template: (args) => `Parametre: ${args.join(', ')}`,
    });

    const resolvedTpl = promptTemplateManager.resolveInput('/custom-tpl foo bar');
    expect(resolvedTpl.isCommand).toBe(true);
    expect(resolvedTpl.isSystem).toBe(false);
    expect(resolvedTpl.resolvedText).toBe('Parametre: foo, bar');
  });
});
