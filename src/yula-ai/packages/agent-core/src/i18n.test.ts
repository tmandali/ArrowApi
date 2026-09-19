import { describe, it, expect, beforeEach } from 'vitest';
import { i18nManager, trDictionary, enDictionary } from './i18n';
import { promptTemplateManager } from './prompt-templates';
import { uiRegistry } from './component-registry';

describe('🌍 Zero-Dependency i18n Subsystem', () => {
  beforeEach(() => {
    i18nManager.setLocale('tr');
    i18nManager.setOverrides({});
  });

  it('Varsayılan Türkçe sözlük ve komut açıklamaları döner', () => {
    expect(i18nManager.getLocale()).toBe('tr');
    const dict = i18nManager.getDictionary();
    expect(dict.commands.model).toContain('Aktif LLM modelini');
    expect(dict.errors.undoUnavailable).toBe('Geri alınacak daha eski bir durum bulunamadı.');

    const cmd = promptTemplateManager.get('/model');
    expect(cmd?.description).toContain('Aktif LLM modelini');
  });

  it('İngilizce (en) diline geçiş yapıldığında sistem komutları ve hatalar İngilizce olur', () => {
    i18nManager.setLocale('en');
    expect(i18nManager.getLocale()).toBe('en');

    const dict = i18nManager.getDictionary();
    expect(dict.commands.model).toContain('Switches the active LLM model');
    expect(dict.errors.undoUnavailable).toBe('No earlier state available to rollback to.');

    const cmd = promptTemplateManager.get('/model');
    expect(cmd?.description).toContain('Switches the active LLM model');

    // Preflight doğrulaması İngilizce hata döner
    const preflight = uiRegistry.preflightValidate('non_existent_comp', 'TEST');
    expect(preflight.valid).toBe(false);
    expect(preflight.error).toContain('is currently not mounted');
  });

  it('Özel sözlükle kısmi ezme (Partial Override) başarıyla çalışır', () => {
    i18nManager.setOverrides({
      commands: {
        ...trDictionary.commands,
        model: 'Özel Model Seçici v2',
      },
    });

    const cmd = promptTemplateManager.get('/model');
    expect(cmd?.description).toBe('Özel Model Seçici v2');

    // Diğer komutlar varsayılan kalır
    const helpCmd = promptTemplateManager.get('/help');
    expect(helpCmd?.description).toContain('sistem ve beceri');
  });

  it('Listener aboneliği dil değiştiğinde tetiklenir', () => {
    let notifiedLocale = '';
    const unsub = i18nManager.subscribe((dict, locale) => {
      notifiedLocale = locale;
    });

    i18nManager.setLocale('en');
    expect(notifiedLocale).toBe('en');
    unsub();
  });
});
