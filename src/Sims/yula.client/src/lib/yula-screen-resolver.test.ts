import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveTargetScreen } from "./yula-screen-resolver";
import type { YulaConversation } from "@/lib/stores/chats";
import type { YulaMessage } from "@/app/api/agent/chat/route";

describe("🧭 Yula Screen Resolver Tests", () => {
  it("returns current pathname if not on workspace home path", () => {
    const screen = resolveTargetScreen("/stock/item");
    assert.equal(screen, "/stock/item");
  });

  it("resolves exact execution URL when activeConv has jobId and report pathname", () => {
    const activeConv: YulaConversation = {
      id: "conv-1",
      title: "hangi raporlar var",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pathname: "/stock/retail-sales-report",
      jobId: "c3d18e80-87a3-48b2-b13c-04c3c39c8942",
    };

    const screen = resolveTargetScreen("/", activeConv);
    assert.equal(
      screen,
      "/stock/retail-sales-report/c3d18e80-87a3-48b2-b13c-04c3c39c8942",
    );
  });

  it("resolves pathname from activeConv if on home path without jobId", () => {
    const activeConv: YulaConversation = {
      id: "conv-2",
      title: "stok bakiye",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pathname: "/stock/stock-balance",
    };

    const screen = resolveTargetScreen("/", activeConv);
    assert.equal(screen, "/stock/stock-balance");
  });

  it("resolves target from tool messages when activeConv pathname is home", () => {
    const activeConv: YulaConversation = {
      id: "conv-3",
      title: "rapor calistir",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pathname: "/",
    };

    const messages: YulaMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        parts: [
          {
            type: "tool-run_job",
            output: {
              jobId: "951ef40a-f027-4ee4-9041-9442aa46d5c5",
              navigateTo: "/stock/retail-sales-report/951ef40a-f027-4ee4-9041-9442aa46d5c5",
            },
          },
        ],
      },
    ];

    const screen = resolveTargetScreen("/", activeConv, messages);
    assert.equal(
      screen,
      "/stock/retail-sales-report/951ef40a-f027-4ee4-9041-9442aa46d5c5",
    );
  });

  it("resolves report by title matching when pathname is missing", () => {
    const activeConv: YulaConversation = {
      id: "conv-4",
      title: "Perakende Satış Raporu Özeti",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pathname: "/",
    };

    const screen = resolveTargetScreen("/", activeConv);
    assert.equal(screen, "/stock/retail-sales-report");
  });

  it("falls back to default report or /stock when no context is available", () => {
    const screen = resolveTargetScreen("/");
    assert.ok(screen.startsWith("/stock"));
  });
});
