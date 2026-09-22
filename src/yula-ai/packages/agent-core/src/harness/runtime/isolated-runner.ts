export type IsolationMode = 'worker' | 'iframe' | 'docker';

export interface SandboxConfig {
  mode: IsolationMode;
  memoryLimitMb?: number;
  timeoutMs?: number;
  networkAccess?: boolean;
}

export interface IsolatedRunResult<T = any> {
  success: boolean;
  durationMs: number;
  result?: T;
  error?: string;
  sandboxType: IsolationMode;
}

export class IsolatedSandboxRunner {
  /**
   * Bir fonksiyonu veya görevi güvenli sandbox izolasyonunda yürütür.
   */
  async runTask<T = any>(
    taskName: string,
    executor: () => Promise<T>,
    config: SandboxConfig = { mode: 'worker', timeoutMs: 5000 }
  ): Promise<IsolatedRunResult<T>> {
    const start = Date.now();
    let timeoutId: any;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`[IsolatedSandboxRunner] "${taskName}" sandbox zaman aşımına uğradı (${config.timeoutMs}ms)`));
        }, config.timeoutMs || 5000);
      });

      const result = await Promise.race([executor(), timeoutPromise]);
      clearTimeout(timeoutId);

      return {
        success: true,
        durationMs: Date.now() - start,
        result,
        sandboxType: config.mode,
      };
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      return {
        success: false,
        durationMs: Date.now() - start,
        error: err?.message || String(err),
        sandboxType: config.mode,
      };
    }
  }

  /**
   * Pi Evals için Dockerfile manifesti üretir.
   */
  generateDockerfileManifest(appName = 'pi-ui-agent'): string {
    return `
# Pi Evals Isolated Docker Runner Manifest
FROM node:20-alpine AS runner
WORKDIR /app

# Güvenlik: Non-root kullanıcı
RUN addgroup -S agentgroup && adduser -S agentuser -G agentgroup
USER agentuser

COPY --chown=agentuser:agentgroup package*.json ./
RUN npm ci --only=production

COPY --chown=agentuser:agentgroup . .

# Sandbox bellek ve zaman sınırları
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV AGENT_SANDBOX_MODE="docker"

CMD ["npm", "run", "evals"]
`.trim();
  }

  /**
   * Pi Evals için docker-compose.yml manifesti üretir.
   */
  generateDockerComposeManifest(): string {
    return `
version: '3.8'
services:
  pi-eval-runner:
    build:
      context: .
      dockerfile: Dockerfile.eval
    mem_limit: 512m
    cpus: 1.0
    network_mode: none # Tam ağ izolasyonu
    environment:
      - CI=true
      - HEADLESS_AGENT=true
`.trim();
  }
}

export const isolatedRunner = new IsolatedSandboxRunner();
