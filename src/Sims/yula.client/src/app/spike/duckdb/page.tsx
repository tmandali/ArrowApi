"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";

type Step = { ok: boolean; label: string; detail?: string };

/**
 * Faz 1a spike — DuckDB WASM × Turbopack kanıtı.
 * getJsDelivrBundles CDN'den bundle çözer; build bu importları toplarsa ve
 * runtime'da instantiate + query dönerse faz geçer sayılır.
 */
export default function DuckDbSpikePage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(true);

  const push = (step: Step) => setSteps((prev) => [...prev, step]);

  useEffect(() => {
    let disposed = false;

    async function run() {
      try {
        push({ ok: true, label: "dynamic import('@duckdb/duckdb-wasm')" });
        const duckdb = await import("@duckdb/duckdb-wasm");

        push({ ok: true, label: "selectBundle(/public/duckdb self-hosted)" });
        const bundle = await duckdb.selectBundle({
          mvp: {
            mainModule: "/duckdb/duckdb-mvp.wasm",
            mainWorker: "/duckdb/duckdb-browser-mvp.worker.js",
          },
          eh: {
            mainModule: "/duckdb/duckdb-eh.wasm",
            mainWorker: "/duckdb/duckdb-browser-eh.worker.js",
          },
        });
        if (!bundle.mainWorker || !bundle.mainModule) {
          throw new Error("bundle mainWorker/mainModule eksik");
        }

        push({
          ok: true,
          label: "new Worker(bundle.mainWorker)",
          detail: bundle.mainWorker,
        });
        const worker = new Worker(bundle.mainWorker);

        const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
        const db = new duckdb.AsyncDuckDB(logger, worker);

        push({ ok: true, label: "instantiate(mainModule, pthreadWorker)" });
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

        const conn = await db.connect();

        push({ ok: true, label: "SELECT sum(v) FROM range(1_000_000)" });
        const result = await conn.query(
          "SELECT SUM(value)::HUGEINT AS total FROM range(1000000) t(value)",
        );
        const row = result.toArray()[0] as Record<string, bigint | number>;
        const total = row.total?.toString() ?? "?";

        push({
          ok: true,
          label: "bağlantı kapatılıyor",
          detail: `range(1..1_000_000) toplamı = ${total}`,
        });

        await conn.close();
        await db.terminate();
        worker.terminate();
        if (!disposed) setRunning(false);
      } catch (error) {
        if (!disposed) {
          push({
            ok: false,
            label: "SPIKE BAŞARISIZ",
            detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          });
          setRunning(false);
        }
      }
    }

    void run();
    return () => {
      disposed = true;
    };
  }, []);

  return (
    <AppLayout>
    <main className="p-8 font-mono text-sm">
      <h1 className="mb-4 text-lg font-bold">DuckDB WASM × Turbopack Spike</h1>
      <ul className="space-y-1">
        {steps.map((step, i) => (
          <li key={i} className={step.ok ? "" : "font-bold text-red-600"}>
            {step.ok ? "✓" : "✗"} {step.label}
            {step.detail && <span className="opacity-70"> — {step.detail}</span>}
          </li>
        ))}
        {running && <li className="animate-pulse opacity-60">… çalışıyor</li>}
      </ul>
    </main>
    </AppLayout>
  );
}