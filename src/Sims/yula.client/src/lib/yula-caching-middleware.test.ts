/**
 * Node built-in test runner: npx tsx --test src/lib/yula-caching-middleware.test.ts
 * Araç çağrısı içeren stream adımları önbelleğe alınmaz (replay yan etkisi);
 * salt-metin adımlar aynen replay edilir.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { yulaCachingMiddleware } from "./yula-caching-middleware.ts";

type Chunk = { type: string; [k: string]: unknown };

function chunkStream(chunks: Chunk[]): ReadableStream<Chunk> {
  return new ReadableStream<Chunk>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Chunk>): Promise<Chunk[]> {
  const out: Chunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

type WrapStream = (args: {
  doStream: () => Promise<{ stream: ReadableStream<Chunk> }>;
  params: unknown;
}) => Promise<{ stream: ReadableStream<Chunk> }>;

const TEXT_PARAMS = {
  prompt: [{ role: "user", content: [{ type: "text", text: "merhaba" }] }],
  mode: { type: "regular" },
  inputFormat: "messages",
};

const TOOL_PARAMS = {
  prompt: [{ role: "user", content: [{ type: "text", text: "raporu çalıştır" }] }],
  mode: { type: "regular" },
  inputFormat: "messages",
};

describe("yulaCachingMiddleware", () => {
  it("replays text-only steps from cache on identical params", async () => {
    const mw = yulaCachingMiddleware({ persistToDisk: false });
    const wrapStream = mw.wrapStream as unknown as WrapStream;
    const chunks: Chunk[] = [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "selam" },
      { type: "text-end", id: "t1" },
    ];
    let calls = 0;
    const doStream = async () => {
      calls += 1;
      return { stream: chunkStream(chunks) };
    };
    const first = await collect(
      (await wrapStream({ doStream, params: TEXT_PARAMS })).stream,
    );
    assert.deepEqual(first, chunks);
    const second = await collect(
      (await wrapStream({ doStream, params: TEXT_PARAMS })).stream,
    );
    assert.deepEqual(second, chunks);
    assert.equal(calls, 1);
  });

  it("does not cache steps containing tool calls", async () => {
    const mw = yulaCachingMiddleware({ persistToDisk: false });
    const wrapStream = mw.wrapStream as unknown as WrapStream;
    const chunks: Chunk[] = [
      { type: "text-delta", id: "t1", delta: "çalıştırıyorum" },
      {
        type: "tool-input-available",
        id: "c1",
        toolName: "run_job",
        input: { report: "stock-balance" },
      },
    ];
    let calls = 0;
    const doStream = async () => {
      calls += 1;
      return { stream: chunkStream(chunks) };
    };
    await collect((await wrapStream({ doStream, params: TOOL_PARAMS })).stream);
    await collect((await wrapStream({ doStream, params: TOOL_PARAMS })).stream);
    assert.equal(calls, 2);
  });

  it("does not cache steps containing dynamic-tool parts", async () => {
    const mw = yulaCachingMiddleware({ persistToDisk: false });
    const wrapStream = mw.wrapStream as unknown as WrapStream;
    const chunks: Chunk[] = [{ type: "dynamic-tool", toolName: "x", input: {} }];
    let calls = 0;
    const doStream = async () => {
      calls += 1;
      return { stream: chunkStream(chunks) };
    };
    await collect((await wrapStream({ doStream, params: TOOL_PARAMS })).stream);
    await collect((await wrapStream({ doStream, params: TOOL_PARAMS })).stream);
    assert.equal(calls, 2);
  });
});
