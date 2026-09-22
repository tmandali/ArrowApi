/**
 * @file diagnostic-triage.ts
 * Deterministic Diagnostic Triage & Self-Heal Guard for Critical Events and Tool Failures.
 * Provides zero-latency, zero-token classification separating recoverable syntax/schema
 * errors from unrecoverable business logic, permission, and infrastructure errors.
 */

export type DiagnosticCategory =
  | 'SYNTAX_OR_SCHEMA'
  | 'BUSINESS_LOGIC'
  | 'PERMISSIONS'
  | 'INFRASTRUCTURE'
  | 'DATA_NOT_FOUND'
  | 'UNKNOWN';

export type DiagnosticAction = 'SELF_HEAL' | 'ASK_USER_CHOICE' | 'HALT';

export interface DiagnosticChoice {
  label: string;
  description?: string;
  rationale?: string;
  badge?: string;
}

export interface DiagnosticVerdict {
  category: DiagnosticCategory;
  isRecoverable: boolean;
  action: DiagnosticAction;
  confidence: number; // 0..1
  reason: string;
  recoveryHint?: string;
  userFriendlyExplanation?: string;
  suggestedChoices?: DiagnosticChoice[];
}

export interface DiagnosticContext {
  source?: string;
  payload?: unknown;
  topic?: string;
  correlationId?: string;
}

/**
 * Deterministic error classifier (Tier 1).
 * Evaluates error signatures synchronously with 0 ms latency and 0 LLM tokens.
 */
export function classifyDiagnosticError(
  error: unknown,
  _context?: DiagnosticContext,
): DiagnosticVerdict {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : JSON.stringify(error ?? '');

  const lowerMsg = message.toLowerCase();

  // 1. Syntax / Schema / Validation (Recoverable by LLM retry)
  const isZod =
    (error && typeof error === 'object' && 'issues' in error) ||
    lowerMsg.includes('invalid_type') ||
    lowerMsg.includes('unrecognized_keys') ||
    lowerMsg.includes('expected string') ||
    lowerMsg.includes('expected number') ||
    lowerMsg.includes('expected boolean') ||
    lowerMsg.includes('validation error');

  const isJsonParse =
    lowerMsg.includes('unexpected token') ||
    lowerMsg.includes('json.parse') ||
    lowerMsg.includes('is not valid json') ||
    lowerMsg.includes('invalid json');

  const isDuckDbSyntax =
    lowerMsg.includes('parser error: syntax error') ||
    lowerMsg.includes('syntax error at or near') ||
    lowerMsg.includes('binder error: referenced column') ||
    lowerMsg.includes('table does not have a column named');

  if (isZod || isJsonParse || isDuckDbSyntax) {
    let hint = 'Parametre veya sözdizimi biçimini kontrol edip yeniden deneyin.';
    if (isZod) {
      hint = 'Araç parametre tiplerini (string/number/array) ve şema kısıtlamalarını kontrol edip düzeltin.';
    } else if (isJsonParse) {
      hint = 'JSON dizesindeki tırnak ve parantez sözdizimini düzeltip tekrar çağırın.';
    } else if (isDuckDbSyntax) {
      hint = 'DuckDB SQL sorgusundaki tablo ve kolon adlarını, anahtar kelime yazımını düzeltin.';
    }

    return {
      category: 'SYNTAX_OR_SCHEMA',
      isRecoverable: true,
      action: 'SELF_HEAL',
      confidence: 0.95,
      reason: message,
      recoveryHint: hint,
      userFriendlyExplanation: 'Araç parametrelerinde sözdizimi veya şema uyumsuzluğu tespit edildi.',
    };
  }

  // 2. Permissions / Authentication (Unrecoverable by retry)
  const isPermission =
    lowerMsg.includes('401') ||
    lowerMsg.includes('403') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('yetkisiz') ||
    lowerMsg.includes('yetki yok') ||
    lowerMsg.includes('access denied') ||
    lowerMsg.includes('permission denied');

  if (isPermission) {
    return {
      category: 'PERMISSIONS',
      isRecoverable: false,
      action: 'ASK_USER_CHOICE',
      confidence: 0.9,
      reason: message,
      userFriendlyExplanation: 'Bu işlemi gerçekleştirmek için gerekli kullanıcı yetkisi bulunmuyor.',
      suggestedChoices: [
        {
          label: 'Farklı Kapsam Seç',
          description: 'Erişim yetkiniz bulunan başka bir şirket veya mağaza ile devam edin.',
          badge: 'Önerilen',
        },
        {
          label: 'Yetki Talep Et',
          description: 'Sistem yöneticisine erişim yetkisi talebi iletmek üzere bildirim oluşturur.',
        },
        {
          label: 'İşlemi İptal Et',
          description: 'Mevcut rapor veya işlem akışını sonlandırır.',
        },
      ],
    };
  }

  // 3. Infrastructure & Network Crashes (Unrecoverable by direct retry)
  const isInfrastructure =
    lowerMsg.includes('500') ||
    lowerMsg.includes('502') ||
    lowerMsg.includes('503') ||
    lowerMsg.includes('504') ||
    lowerMsg.includes('out of memory') ||
    lowerMsg.includes('wasm oom') ||
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('networkerror') ||
    lowerMsg.includes('cannot connect') ||
    lowerMsg.includes('stream error') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('timed out');

  if (isInfrastructure) {
    const isOllamaDown =
      lowerMsg.includes('ollama') ||
      lowerMsg.includes('11434') ||
      lowerMsg.includes('cannot connect to api');
    return {
      category: 'INFRASTRUCTURE',
      isRecoverable: false,
      action: 'ASK_USER_CHOICE',
      confidence: 0.95,
      reason: message,
      userFriendlyExplanation: isOllamaDown
        ? 'Yerel Ollama servisine (127.0.0.1:11434) bağlanılamadı. Lütfen Ollama uygulamasının çalıştığından emin olun veya sağ üstten Azure bulut modeline geçin.'
        : 'Sunucu bağlantısında veya LLM akışında geçici bir kesinti yaşandı.',
      suggestedChoices: [
        {
          label: 'Tekrar Dene',
          description: isOllamaDown
            ? 'Ollama servisini başlattıktan sonra sorguyu yeniden gönderin.'
            : 'Sunucu bağlantısını yenileyerek işlemi yeniden başlatır.',
          badge: 'Önerilen',
        },
        {
          label: 'Sistem Durumunu İncele',
          description: 'Telemetri izleyici üzerinden sunucu yanıt sürelerini kontrol eder.',
        },
        {
          label: 'Vazgeç',
          description: 'İşlem talebini iptal eder.',
        },
      ],
    };
  }

  // 4. ERP Business Logic & Data Not Found
  const isDataNotFound =
    lowerMsg.includes('bulunamadı') ||
    lowerMsg.includes('not found') ||
    lowerMsg.includes('kayıt yok') ||
    lowerMsg.includes('no records');

  if (isDataNotFound) {
    return {
      category: 'DATA_NOT_FOUND',
      isRecoverable: false,
      action: 'ASK_USER_CHOICE',
      confidence: 0.85,
      reason: message,
      userFriendlyExplanation: 'Belirtilen kriterlere uygun veri veya kayıt bulunamadı.',
      suggestedChoices: [
        {
          label: 'Kriterleri Genişlet',
          description: 'Tarih aralığını veya filtreleri genişleterek tekrar arama yapar.',
          badge: 'Önerilen',
        },
        {
          label: 'Farklı Kod Dene',
          description: 'Mağaza veya ürün kodunu değiştirerek arama yapar.',
        },
        {
          label: 'İptal Et',
          description: 'İşlemi sonlandırır.',
        },
      ],
    };
  }

  const isBusinessLogic =
    lowerMsg.includes('kapalı dönem') ||
    lowerMsg.includes('closed period') ||
    lowerMsg.includes('yetersiz bakiye') ||
    lowerMsg.includes('stok kalmadı') ||
    lowerMsg.includes('limit aşıldı');

  if (isBusinessLogic) {
    return {
      category: 'BUSINESS_LOGIC',
      isRecoverable: false,
      action: 'ASK_USER_CHOICE',
      confidence: 0.85,
      reason: message,
      userFriendlyExplanation: 'İşlem, kurumsal ERP iş kuralları kısıtlaması nedeniyle tamamlanamadı.',
      suggestedChoices: [
        {
          label: 'Geçerli Dönemi Seç',
          description: 'Açık olan geçerli mali dönemle devam eder.',
          badge: 'Önerilen',
        },
        {
          label: 'Parametreleri Düzenle',
          description: 'Limit veya tutar kriterlerini düzenler.',
        },
        {
          label: 'İptal Et',
          description: 'İşlemi iptal eder.',
        },
      ],
    };
  }

  // 5. Ambiguous / Unknown Error
  return {
    category: 'UNKNOWN',
    isRecoverable: false,
    action: 'ASK_USER_CHOICE',
    confidence: 0.3,
    reason: message,
    userFriendlyExplanation: message || 'Beklenmeyen bir hata oluştu.',
    suggestedChoices: [
      {
        label: 'Detayları İncele',
        description: 'Hata ayrıntılarını ve telemetri kayıtlarını görüntüler.',
        badge: 'Önerilen',
      },
      {
        label: 'İptal Et',
        description: 'İşlemi durdurur.',
      },
    ],
  };
}

/**
 * Bounded Self-Heal Retry Guard (Tier 3).
 * Limits self-heal attempts to maxAttempts (default 2).
 * Escalates to ASK_USER_CHOICE once the limit is reached.
 */
export class DiagnosticRetryGuard {
  private attempts = new Map<string, number>();

  constructor(private readonly maxAttempts: number = 2) {}

  getAttempts(key: string): number {
    return this.attempts.get(key) || 0;
  }

  recordAttempt(key: string): number {
    const next = (this.attempts.get(key) || 0) + 1;
    this.attempts.set(key, next);
    return next;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  clear(): void {
    this.attempts.clear();
  }

  canAttemptSelfHeal(key: string): boolean {
    return (this.attempts.get(key) || 0) < this.maxAttempts;
  }

  applyGuard(verdict: DiagnosticVerdict, key: string): DiagnosticVerdict {
    if (!verdict.isRecoverable) {
      return verdict;
    }

    const currentAttempts = this.recordAttempt(key);
    if (currentAttempts > this.maxAttempts) {
      return {
        ...verdict,
        isRecoverable: false,
        action: 'ASK_USER_CHOICE',
        reason: `Maksimum kendi kendine düzeltme deneme limiti (${this.maxAttempts}) aşıldı. Hata: ${verdict.reason}`,
        userFriendlyExplanation: `${verdict.userFriendlyExplanation || 'İşlem'} tekrarlanan düzeltme denemelerine rağmen çözülemedi. Kullanıcı müdahalesi gerekiyor.`,
        suggestedChoices: verdict.suggestedChoices || [
          {
            label: 'Manuel Müdahale Et',
            description: 'Parametreleri elle belirleyin veya işlemi sıfırlayın.',
            badge: 'Önerilen',
          },
          {
            label: 'İşlemi İptal Et',
            description: 'Talebi durdurur.',
          },
        ],
      };
    }

    return verdict;
  }
}

export const diagnosticRetryGuard = new DiagnosticRetryGuard(2);
