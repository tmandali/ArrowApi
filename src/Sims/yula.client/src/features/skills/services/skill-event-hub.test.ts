import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { SkillEventHub } from "./skill-event-hub.ts"
import { useSkillStore } from "../store/skill-store.ts"

describe("SkillEventHub Architecture", () => {
  it("initializes as an EventTarget singleton", () => {
    const hub1 = SkillEventHub.getInstance()
    const hub2 = SkillEventHub.getInstance()
    assert.equal(hub1, hub2)
    assert.ok(hub1 instanceof EventTarget)
  })

  it("dispatches execution and records snapshot", () => {
    const hub = SkillEventHub.getInstance()
    const executionId = hub.dispatchRun("test-skill", "print('hello')", {
      timeoutMs: 5000,
    })

    assert.ok(executionId)
    assert.equal(typeof executionId, "string")

    const snapshot = hub.getSnapshot(executionId)
    assert.ok(snapshot)
    assert.equal(snapshot.skillName, "test-skill")
    assert.equal(snapshot.status, "running")
  })

  it("aborts execution gracefully", () => {
    const hub = SkillEventHub.getInstance()
    const executionId = hub.dispatchRun("abort-test", "import time; time.sleep(10)")

    hub.abort(executionId)

    const snapshot = hub.getSnapshot(executionId)
    assert.ok(snapshot)
    assert.equal(snapshot.status, "cancelled")
    assert.ok(
      snapshot.logs.some((l) => l.includes("Execution cancelled by user"))
    )
  })
})

describe("SkillStore Draft & Release Lifecycle", () => {
  it("adds draft skill and releases it", async () => {
    const store = useSkillStore.getState()
    const draft = store.addDraftSkill({
      name: "kdv-hesaplayici",
      description: "Hesaplama becerisi",
      instructions: "KDV oranlarını doğrula",
      version: "1.0.0",
      requiredPackages: ["pandas"],
    })

    assert.ok(draft.id.startsWith("user-"))
    assert.equal(draft.status, "draft")

    // Release skill
    const success = await store.releaseSkill(draft.id)
    assert.equal(success, true)

    const released = useSkillStore
      .getState()
      .userSkills.find((s) => s.id === draft.id)
    assert.ok(released)
    assert.equal(released.status, "released")

    // Clean up
    store.deleteSkill(draft.id)
  })
})
