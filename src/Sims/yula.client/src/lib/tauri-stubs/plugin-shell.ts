/**
 * Web-only proje: Tauri paketleri kurulmaz. Sidecar üretimi yalnızca
 * masaüstünde çalışır; burada asla çağrılmamalı (isTauriEnv=false).
 */
export interface StubChildProcess {
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  stderr: { on: (event: string, cb: (data: string) => void) => void };
  stdout: { on: (event: string, cb: (data: string) => void) => void };
  spawn: () => Promise<StubChildProcess>;
  write: (line: string) => Promise<void>;
}

export const Command = {
  sidecar(_name: string, ..._rest: unknown[]): StubChildProcess {
    throw new Error("[Web-only] Tauri sidecar kullanılamaz");
  },
};
