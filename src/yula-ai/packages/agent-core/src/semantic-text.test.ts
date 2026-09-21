import { describe, it, expect } from 'vitest';
import {
  isTextPart,
  isReasoningPart,
  classifyTextPart,
  getMessageText,
} from './step-frame-types';

describe('Semantic Text Classification & Type Guards', () => {
  it('isTextPart correctly identifies text parts and narrows types', () => {
    expect(isTextPart({ type: 'text', text: 'Hello' })).toBe(true);
    expect(isTextPart({ type: 'reasoning', text: 'Thinking' })).toBe(false);
    expect(isTextPart(null)).toBe(false);
    expect(isTextPart({})).toBe(false);
    expect(isTextPart({ type: 'text' })).toBe(false);
  });

  it('isReasoningPart correctly identifies reasoning parts', () => {
    expect(isReasoningPart({ type: 'reasoning', text: 'Thinking...', meta: 'planning' })).toBe(true);
    expect(isReasoningPart({ type: 'text', text: 'Hello' })).toBe(false);
  });

  it('classifyTextPart classifies plan rationale when tools exist in message', () => {
    const planText = 'Plan:\n• Perakende Satış Raporu açılacak.\n• Tarih aralığı 2026-09-14..2026-09-20';
    expect(classifyTextPart(planText, true)).toBe('plan_rationale');
    expect(classifyTextPart('Any text preceding tool execution', true)).toBe('plan_rationale');
  });

  it('classifyTextPart classifies final_synthesis when no tools are present', () => {
    expect(classifyTextPart('Kadıköy mağazası geçen hafta 142.500 TL ciro yaptı.', false)).toBe('final_synthesis');
    expect(classifyTextPart('', false)).toBe('final_synthesis');
  });

  it('getMessageText concatenates all valid text parts safely', () => {
    const message = {
      parts: [
        { type: 'text', text: 'İlk paragraf.' },
        { type: 'reasoning', text: 'Gizli düşünce.' },
        { type: 'text', text: 'İkinci paragraf.' },
        { type: 'tool-call', toolName: 'submit' },
      ],
    };

    expect(getMessageText(message)).toBe('İlk paragraf.\nİkinci paragraf.');
    expect(getMessageText(undefined)).toBe('');
    expect(getMessageText({ parts: [] })).toBe('');

    const semanticMsg = {
      parts: [
        { type: 'text', text: 'Plan: Adım 1...', role: 'plan_rationale' as const },
        { type: 'text', text: 'Nihai cevap metni.', role: 'final_synthesis' as const },
      ],
    };
    expect(getMessageText(semanticMsg, { roles: ['final_synthesis'] })).toBe('Nihai cevap metni.');
    expect(getMessageText(semanticMsg, { excludeRoles: ['plan_rationale'] })).toBe('Nihai cevap metni.');
  });
});
