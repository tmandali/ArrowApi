import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useActiveScreenStore } from "./active-screen-store";
import { useScreenJourneyStore } from "./screen-journey-store";
import { defineScreenContract } from "@/lib/contracts/screen-contract";

describe("useActiveScreenStore", () => {
  const dummyContract = defineScreenContract({
    screenId: "test_screen",
    screenTitle: "Test Ekranı",
    workspace: "my",
    category: "interactive_operator",
    aiEnabled: true,
    promptGuidelines: ["Kural 1: Daima doğrula"],
    actions: {},
  });

  it("sets active screen, initial state and quick prompts", () => {
    useActiveScreenStore.getState().setScreen(dummyContract, { count: 1 }, ["Hızlı Eylem 1"]);

    const s = useActiveScreenStore.getState();
    assert.equal(s.activeScreen?.screenId, "test_screen");
    assert.equal(s.activeScreen?.screenTitle, "Test Ekranı");
    assert.deepEqual(s.state, { count: 1 });
    assert.deepEqual(s.quickPrompts, ["Hızlı Eylem 1"]);
    assert.equal(s.canUndo, false);
  });

  it("updates state without history when pushHistory is false", () => {
    useActiveScreenStore.getState().setScreen(dummyContract, { count: 1 });
    useActiveScreenStore.getState().updateState({ count: 2 });

    const s = useActiveScreenStore.getState();
    assert.deepEqual(s.state, { count: 2 });
    assert.equal(s.history.length, 0);
    assert.equal(s.canUndo, false);
  });

  it("tracks state history and undoes previous mutation when pushHistory is true", () => {
    useActiveScreenStore.getState().setScreen(dummyContract, { step: "initial", value: 10 });

    // Mutation 1
    useActiveScreenStore.getState().updateState({ step: "modified", value: 20 }, true);
    assert.equal(useActiveScreenStore.getState().canUndo, true);
    assert.deepEqual(useActiveScreenStore.getState().state, { step: "modified", value: 20 });

    // Mutation 2
    useActiveScreenStore.getState().updateState({ step: "final", value: 30 }, true);
    assert.deepEqual(useActiveScreenStore.getState().state, { step: "final", value: 30 });
    assert.equal(useActiveScreenStore.getState().history.length, 2);

    // Undo 1 -> should revert to { step: "modified", value: 20 }
    const reverted1 = useActiveScreenStore.getState().undo();
    assert.deepEqual(reverted1, { step: "modified", value: 20 });
    assert.deepEqual(useActiveScreenStore.getState().state, { step: "modified", value: 20 });
    assert.equal(useActiveScreenStore.getState().canUndo, true);

    // Undo 2 -> should revert to { step: "initial", value: 10 }
    const reverted2 = useActiveScreenStore.getState().undo();
    assert.deepEqual(reverted2, { step: "initial", value: 10 });
    assert.deepEqual(useActiveScreenStore.getState().state, { step: "initial", value: 10 });
    assert.equal(useActiveScreenStore.getState().canUndo, false);

    // Undo 3 -> no further history, returns null
    const reverted3 = useActiveScreenStore.getState().undo();
    assert.equal(reverted3, null);
  });

  it("restores draft from screenJourneyStore exit snapshot", () => {
    useScreenJourneyStore.getState().clearJourney();
    useScreenJourneyStore.getState().recordScreenEnter("/my/settings", "Kullanıcı Ayarları");
    useScreenJourneyStore.getState().recordScreenExit("/my/settings", {
      theme: "dark",
      language: "tr",
    });

    useActiveScreenStore.getState().setScreen(dummyContract, { current: true });
    const restored = useActiveScreenStore.getState().restoreDraft("/my/settings");

    assert.deepEqual(restored, { theme: "dark", language: "tr" });
    assert.equal(useActiveScreenStore.getState().state.theme, "dark");
    assert.equal(useActiveScreenStore.getState().state.language, "tr");
    assert.equal(useActiveScreenStore.getState().state.current, true);
  });

  it("clears screen and resets history", () => {
    useActiveScreenStore.getState().setScreen(dummyContract, { foo: "bar" }, ["Prompt"]);
    useActiveScreenStore.getState().updateState({ foo: "baz" }, true);
    useActiveScreenStore.getState().clearScreen();

    const s = useActiveScreenStore.getState();
    assert.equal(s.activeScreen, null);
    assert.deepEqual(s.state, {});
    assert.deepEqual(s.quickPrompts, []);
    assert.equal(s.history.length, 0);
    assert.equal(s.canUndo, false);
  });
});
