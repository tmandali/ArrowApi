import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JOB_DETAIL_ACTION_CONTRACT,
  getJobDetailTool,
} from "./job-detail-tool";
import { executeDispatchComponentAction } from "./dispatch-bridge";

describe("job-detail-tool", () => {
  it("JOB_DETAIL_ACTION_CONTRACT Zod inputSchema geçerli parametreleri doğrular", () => {
    const parsedEmpty = JOB_DETAIL_ACTION_CONTRACT.inputSchema.parse({});
    assert.equal(parsedEmpty.jobId, undefined);

    const parsedWithId = JOB_DETAIL_ACTION_CONTRACT.inputSchema.parse({
      jobId: "f601c4c3-aef3-42ec-8c3e-8dc79ab948ad",
    });
    assert.equal(parsedWithId.jobId, "f601c4c3-aef3-42ec-8c3e-8dc79ab948ad");
  });

  it("JOB_DETAIL_ACTION_CONTRACT outputSchema beklenen detay formatını doğrular", () => {
    const mockDetail = {
      status: "ok",
      jobId: "f601c4c3-aef3-42ec-8c3e-8dc79ab948ad",
      summary: {
        status: "Running",
        owner: "Sistem",
        createdAt: "2026-09-21T10:15:18",
        completedAt: null,
        durationMs: 46,
        totalRows: 0,
        batchCount: 0,
      },
      progress: {
        phase: "Running",
        totalEvents: 2,
        events: [
          { phase: "Queued", message: "Sırada", elapsedMs: 0 },
          { phase: "Running", message: "Çalışıyor", elapsedMs: 54 },
        ],
      },
      requestInput: {
        from_hareketTarihi: "2026-09-07",
        to_hareketTarihi: "2026-09-14",
        sirketKod: "TRLC",
      },
    };

    const parsed = JOB_DETAIL_ACTION_CONTRACT.outputSchema.parse(mockDetail);
    assert.equal(parsed.jobId, "f601c4c3-aef3-42ec-8c3e-8dc79ab948ad");
    assert.equal(parsed.summary.status, "Running");
    assert.equal(parsed.requestInput.sirketKod, "TRLC");
    assert.equal(parsed.progress.events.length, 2);
  });

  it("getJobDetailTool hedef jobId bulunamadığında anlaşılır hata döner", async () => {
    const res = (await getJobDetailTool({})) as { status: string; message: string };
    assert.equal(res.status, "error");
    assert.ok(res.message.includes("No job specified"));
  });

  it("dispatch-bridge job_history GET_DETAIL aksiyonunu yönlendirir", async () => {
    const res = (await executeDispatchComponentAction({
      component_id: "job_history",
      action: "GET_DETAIL",
      payload: {},
    })) as { status: string };
    // Hedef job olmadığından error döner ancak dispatch bridge unknown-action dönmez
    assert.equal(res.status, "error");
  });
});
