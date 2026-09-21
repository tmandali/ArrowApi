import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyDiagnosticError,
  DiagnosticRetryGuard,
  type DiagnosticVerdict,
} from './diagnostic-triage';

describe('Diagnostic Triage (Tier 1)', () => {
  it('identifies Zod schema validation errors as recoverable SYNTAX_OR_SCHEMA', () => {
    const zodError = {
      issues: [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['companyCode'],
          message: 'Expected string, received number',
        },
      ],
    };

    const verdict = classifyDiagnosticError(zodError);
    expect(verdict.category).toBe('SYNTAX_OR_SCHEMA');
    expect(verdict.isRecoverable).toBe(true);
    expect(verdict.action).toBe('SELF_HEAL');
    expect(verdict.recoveryHint).toContain('şema kısıtlamalarını');
  });

  it('identifies JSON syntax parse errors as recoverable', () => {
    const jsonError = new Error('Unexpected token \'}\', ""is not valid JSON');
    const verdict = classifyDiagnosticError(jsonError);
    expect(verdict.category).toBe('SYNTAX_OR_SCHEMA');
    expect(verdict.isRecoverable).toBe(true);
    expect(verdict.action).toBe('SELF_HEAL');
  });

  it('identifies DuckDB parser errors as recoverable', () => {
    const sqlError = new Error('Parser Error: syntax error at or near "FORM"');
    const verdict = classifyDiagnosticError(sqlError);
    expect(verdict.category).toBe('SYNTAX_OR_SCHEMA');
    expect(verdict.isRecoverable).toBe(true);
    expect(verdict.action).toBe('SELF_HEAL');
    expect(verdict.recoveryHint).toContain('DuckDB SQL');
  });

  it('identifies HTTP 401/403 authorization failures as unrecoverable PERMISSIONS', () => {
    const err = new Error('403 Forbidden: Yetkisiz erişim');
    const verdict = classifyDiagnosticError(err);
    expect(verdict.category).toBe('PERMISSIONS');
    expect(verdict.isRecoverable).toBe(false);
    expect(verdict.action).toBe('ASK_USER_CHOICE');
    expect(verdict.suggestedChoices?.length).toBeGreaterThanOrEqual(2);
    expect(verdict.suggestedChoices?.[0].badge).toBe('Önerilen');
  });

  it('identifies HTTP 500 / WASM OOM as unrecoverable INFRASTRUCTURE', () => {
    const err = new Error('500 Internal Server Error: WASM Out of Memory');
    const verdict = classifyDiagnosticError(err);
    expect(verdict.category).toBe('INFRASTRUCTURE');
    expect(verdict.isRecoverable).toBe(false);
    expect(verdict.action).toBe('ASK_USER_CHOICE');
    expect(verdict.suggestedChoices?.some((c) => c.label === 'Tekrar Dene')).toBe(true);
  });

  it('identifies closed accounting period as unrecoverable BUSINESS_LOGIC', () => {
    const err = new Error('Kapalı dönem üzerinde işlem yapılamaz.');
    const verdict = classifyDiagnosticError(err);
    expect(verdict.category).toBe('BUSINESS_LOGIC');
    expect(verdict.isRecoverable).toBe(false);
    expect(verdict.action).toBe('ASK_USER_CHOICE');
  });

  it('identifies not found records as DATA_NOT_FOUND', () => {
    const err = new Error('Mağaza kodu bulunamadı');
    const verdict = classifyDiagnosticError(err);
    expect(verdict.category).toBe('DATA_NOT_FOUND');
    expect(verdict.isRecoverable).toBe(false);
    expect(verdict.action).toBe('ASK_USER_CHOICE');
  });

  it('falls back to UNKNOWN for unclassified errors', () => {
    const err = new Error('Some random esoteric problem');
    const verdict = classifyDiagnosticError(err);
    expect(verdict.category).toBe('UNKNOWN');
    expect(verdict.confidence).toBeLessThan(0.5);
    expect(verdict.isRecoverable).toBe(false);
  });
});

describe('Diagnostic Retry Guard (Tier 3)', () => {
  let guard: DiagnosticRetryGuard;

  beforeEach(() => {
    guard = new DiagnosticRetryGuard(2);
  });

  it('allows self-heal when attempts are within limit (<= 2)', () => {
    const verdict: DiagnosticVerdict = {
      category: 'SYNTAX_OR_SCHEMA',
      isRecoverable: true,
      action: 'SELF_HEAL',
      confidence: 0.95,
      reason: 'Syntax error',
    };

    const first = guard.applyGuard(verdict, 'key-1');
    expect(first.isRecoverable).toBe(true);
    expect(first.action).toBe('SELF_HEAL');

    const second = guard.applyGuard(verdict, 'key-1');
    expect(second.isRecoverable).toBe(true);
    expect(second.action).toBe('SELF_HEAL');
  });

  it('escalates to ASK_USER_CHOICE when attempt count exceeds 2', () => {
    const verdict: DiagnosticVerdict = {
      category: 'SYNTAX_OR_SCHEMA',
      isRecoverable: true,
      action: 'SELF_HEAL',
      confidence: 0.95,
      reason: 'Syntax error',
    };

    guard.applyGuard(verdict, 'key-2'); // 1
    guard.applyGuard(verdict, 'key-2'); // 2
    const third = guard.applyGuard(verdict, 'key-2'); // 3 -> Exceeded!

    expect(third.isRecoverable).toBe(false);
    expect(third.action).toBe('ASK_USER_CHOICE');
    expect(third.reason).toContain('Maksimum kendi kendine düzeltme deneme limiti');
  });

  it('passes unrecoverable verdicts directly without consuming self-heal budget', () => {
    const unrecov: DiagnosticVerdict = {
      category: 'PERMISSIONS',
      isRecoverable: false,
      action: 'ASK_USER_CHOICE',
      confidence: 0.9,
      reason: '403 Forbidden',
    };

    const res = guard.applyGuard(unrecov, 'key-3');
    expect(res.isRecoverable).toBe(false);
    expect(guard.getAttempts('key-3')).toBe(0);
  });
});
