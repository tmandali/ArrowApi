import { describe, it, expect } from 'vitest';
import { promptTemplateManager } from './prompt-templates';

describe('Built-in Commands & Slash System (Pi Reference)', () => {
  it('/new, /model, /login, /compact, /help sistem komutları olarak kayıtlı olmalıdır', () => {
    const sysCommands = promptTemplateManager.getByCategory('system');
    const cmdNames = sysCommands.map((c) => c.command);

    expect(cmdNames).toContain('/new');
    expect(cmdNames).toContain('/model');
    expect(cmdNames).toContain('/login');
    expect(cmdNames).toContain('/compact');
    expect(cmdNames).toContain('/help');
  });

  it('isSystemCommand sistem komutlarını doğru tespit etmelidir', () => {
    expect(promptTemplateManager.isSystemCommand('/new')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/model gpt-4o')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/login google')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/compact')).toBe(true);
    expect(promptTemplateManager.isSystemCommand('/help')).toBe(true);

    // Prompt şablonları sistem komutu sayılmamalı
    expect(promptTemplateManager.isSystemCommand('/rapor Kadıköy')).toBe(false);
    expect(promptTemplateManager.isSystemCommand('/sirala asc')).toBe(false);
    expect(promptTemplateManager.isSystemCommand('normal bir mesaj')).toBe(false);
  });

  it('resolveInput sistem komutları için isSystem: true dönmelidir', () => {
    const resolvedModel = promptTemplateManager.resolveInput('/model claude-3-5-sonnet');
    expect(resolvedModel.isCommand).toBe(true);
    expect(resolvedModel.isSystem).toBe(true);
    expect(resolvedModel.command).toBe('/model');
    expect(resolvedModel.args).toEqual(['claude-3-5-sonnet']);

    const resolvedRapor = promptTemplateManager.resolveInput('/rapor Beşiktaş 2026-10');
    expect(resolvedRapor.isCommand).toBe(true);
    expect(resolvedRapor.isSystem).toBe(false);
    expect(resolvedRapor.resolvedText).toContain('Beşiktaş mağazası için 2026-10');
  });
});
