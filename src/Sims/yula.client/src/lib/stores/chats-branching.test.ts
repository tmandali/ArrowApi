import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useChatsStore } from "./chats";

describe("useChatsStore - Session Tree & Branching", () => {
  it("initializes a conversation with main branch by default", () => {
    const store = useChatsStore.getState();
    const convId = "test-conv-1";

    store.saveMessages(convId, [
      { id: "m1", role: "user", content: "İlk mesaj", createdAt: new Date() } as any,
      { id: "m2", role: "assistant", content: "İlk yanıt", createdAt: new Date() } as any,
    ]);

    const messages = store.getBranchMessages(convId);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].id, "m1");
  });

  it("forks a branch and clones existing messages into the new branch", () => {
    const store = useChatsStore.getState();
    const convId = "test-conv-2";

    store.saveMessages(convId, [
      { id: "m1", role: "user", content: "Kriterleri belirle", createdAt: new Date() } as any,
      { id: "m2", role: "assistant", content: "Kriterler uygulandı", createdAt: new Date() } as any,
    ]);

    // Fork a scenario branch
    store.forkBranch(convId, "senaryo-indirim");

    const conv = useChatsStore.getState().conversations.find((c) => c.id === convId);
    assert.ok(conv, "Konuşma bulunmalı");
    assert.equal(conv.activeBranch, "senaryo-indirim", "Yeni dal aktif olmalı");
    assert.ok(conv.branches?.["senaryo-indirim"], "Dal katalogda bulunmalı");
    assert.equal(conv.branches["senaryo-indirim"].parentBranch, "main");

    // The cloned branch has the existing messages
    const branchMessages = store.getBranchMessages(convId, "senaryo-indirim");
    assert.equal(branchMessages.length, 2);
    assert.equal(branchMessages[0].id, "m1");

    // Switch back to main
    store.switchBranch(convId, "main");
    const updatedConv = useChatsStore.getState().conversations.find((c) => c.id === convId);
    assert.equal(updatedConv?.activeBranch, "main");
  });
});
