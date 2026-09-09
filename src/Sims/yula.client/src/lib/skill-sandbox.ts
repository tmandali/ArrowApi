/**
 * Agent Skills sandbox soyutlaması (cookbook: agent-skills Step 1) — Yula uyarlaması.
 *
 * SUNUCUYA ÖZEL MODÜL: node:fs / node:child_process kullanır, istemci
 * demetine ASLA alınmaz (istemciye açık olan tek şey skill-discovery'deki
 * saf ayrıştırıcılardır).
 *
 * Güvenlik modeli (v1):
 *  - Tüm dosya erişimi `root` dizinine hapsedilir (jail).
 *  - `exec` yalnızca root altındaki .mjs betiklerini, shell'siz, node ile
 *    koşturur; süre + çıktı kotası vardır. Kullanıcı betiği v1'de YOKTUR —
 *    yalnızca yerleşik scriptler (ilk script indiğinde run_skill_script
 *    aracı eklenecek).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export interface SandboxDirEntry {
  name: string;
  isDirectory(): boolean;
}

export interface Sandbox {
  readFile(path: string, encoding: "utf-8"): Promise<string>;
  readdir(
    path: string,
    opts: { withFileTypes: true },
  ): Promise<SandboxDirEntry[]>;
  exec(opts: {
    /** root altındaki .mjs betiği (göreli yol) */
    script: string;
    args?: string[];
  }): Promise<{ stdout: string; stderr: string }>;
}

export interface NodeSandboxOptions {
  /** Betik süresi üst sınırı (varsayılan 15 sn) */
  timeoutMs?: number;
  /** stdout+stderr toplam kotası (varsayılan 256 KB) */
  maxOutputBytes?: number;
}

export function createNodeSandbox(
  root: string,
  options: NodeSandboxOptions = {},
): Sandbox {
  const absRoot = path.resolve(root);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxOutputBytes = options.maxOutputBytes ?? 256 * 1024;

  /** Jail: root dışına çıkış yasaktır. */
  function jail(p: string): string {
    const abs = path.resolve(absRoot, p);
    if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) {
      throw new Error(`Sandbox jail: root dışına erişim yasak (${p})`);
    }
    return abs;
  }

  return {
    readFile: async (p) => fs.promises.readFile(jail(p), "utf-8"),
    readdir: async (p) => {
      const entries = await fs.promises.readdir(jail(p), {
        withFileTypes: true,
      });
      return entries.map((e) => ({
        name: e.name,
        isDirectory: () => e.isDirectory(),
      }));
    },
    exec: ({ script, args = [] }) =>
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        if (!script.endsWith(".mjs")) {
          reject(new Error("Sandbox exec: yalnız .mjs betikleri koşar"));
          return;
        }
        let abs: string;
        try {
          abs = jail(script);
        } catch (err) {
          reject(err);
          return;
        }
        let stdout = "";
        let stderr = "";
        let outputBytes = 0;
        let settled = false;
        const fail = (err: unknown) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        };
        const ok = (v: { stdout: string; stderr: string }) => {
          if (!settled) {
            settled = true;
            resolve(v);
          }
        };
        const child = spawn(process.execPath, [abs, ...args], {
          shell: false,
          timeout: timeoutMs,
          cwd: path.dirname(abs),
        });
        const push = (buf: Buffer, sink: "out" | "err") => {
          outputBytes += buf.length;
          if (outputBytes > maxOutputBytes) {
            child.kill("SIGKILL");
            fail(new Error("Sandbox exec: çıktı kotası aşıldı"));
            return;
          }
          if (sink === "out") stdout += buf.toString("utf-8");
          else stderr += buf.toString("utf-8");
        };
        child.stdout.on("data", (b: Buffer) => push(b, "out"));
        child.stderr.on("data", (b: Buffer) => push(b, "err"));
        child.on("error", fail);
        child.on("close", (code) => {
          if (code === 0) ok({ stdout, stderr });
          else
            fail(
              new Error(
                `Sandbox exec: betik ${code} ile bitti${stderr ? ` — ${stderr.slice(0, 300)}` : ""}`,
              ),
            );
        });
      }),
  };
}
