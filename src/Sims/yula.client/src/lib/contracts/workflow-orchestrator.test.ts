import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  defineSaga,
  executeSaga,
  resumeSaga,
  formatSagaPrompt,
  resolveSagaStrategy,
  type SagaDefinition,
} from "./workflow-orchestrator";
import {
  registerOrchestrator,
  listOrchestrators,
  getSaga,
  clearRegistry,
  formatAllSagasPrompt,
} from "../orchestration/saga-registry";
import { sellingOrchestrator } from "../../workspaces/selling/selling.orchestrator";
import { orderToCashOrchestrator } from "../../orchestrators/order-to-cash.orchestrator";

describe("Workflow & Saga Orchestration Engine", () => {
  it("executes a multi-step saga successfully when all steps succeed", async () => {
    const saga = sellingOrchestrator.sagas["selling:domestic-order-to-invoice"];
    assert.ok(saga, "Saga must be defined in selling orchestrator");

    const result = await executeSaga(saga, {
      orderId: "SO-2026-001",
      totalAmount: 45000, // Below HITL threshold
    });

    assert.equal(result.status, "completed");
    assert.equal(result.completedSteps.length, 3);
    assert.deepEqual(result.completedSteps, [
      "approve-sales-order",
      "create-delivery-note",
      "create-and-sign-invoice",
    ]);

    const orderRes = result.results["approve-sales-order"] as any;
    assert.equal(orderRes.orderId, "SO-2026-001");
    assert.equal(orderRes.status, "Approved");

    const dnRes = result.results["create-delivery-note"] as any;
    assert.equal(dnRes.deliveryNoteId, "DN-SO-2026-001");
    assert.equal(dnRes.status, "Dispatched");

    const invRes = result.results["create-and-sign-invoice"] as any;
    assert.equal(invRes.invoiceId, "INV-SO-2026-001");
    assert.equal(invRes.status, "SignedAndPosted");
  });

  it("triggers reverse compensation (rollback) when a downstream step fails", async () => {
    const compensationLog: string[] = [];

    const failingSaga: SagaDefinition = defineSaga({
      id: "test:compensating-saga",
      name: "Compensating Test Saga",
      workspace: "test",
      description: "Tests reverse compensation rollback",
      compensatingPolicy: "rollback_all",
      steps: [
        {
          id: "step-1",
          name: "Step 1",
          contextId: "test/context-1",
          action: "doStep1",
          handler: async () => ({ step1Done: true }),
          compensate: async () => {
            compensationLog.push("compensate-step-1");
          },
        },
        {
          id: "step-2",
          name: "Step 2",
          contextId: "test/context-2",
          action: "doStep2",
          handler: async () => ({ step2Done: true }),
          compensate: async () => {
            compensationLog.push("compensate-step-2");
          },
        },
        {
          id: "step-3",
          name: "Step 3 (Throws Error)",
          contextId: "test/context-3",
          action: "doStep3",
          handler: async () => {
            throw new Error("Simulated tax integration failure at step 3");
          },
          compensate: async () => {
            compensationLog.push("compensate-step-3");
          },
        },
      ],
    });

    const result = await executeSaga(failingSaga, {});

    assert.equal(result.status, "compensated");
    assert.equal(result.failedStep, "step-3");
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].error, /Simulated tax integration failure/);

    // Verify reverse execution: step 2 compensated first, then step 1
    assert.deepEqual(compensationLog, [
      "compensate-step-2",
      "compensate-step-1",
    ]);
  });

  it("suspends execution on HITL gateway and resumes on user approval", async () => {
    const saga = sellingOrchestrator.sagas["selling:domestic-order-to-invoice"];

    // 1. Initial run with amount > 100K triggers HITL pause
    const suspendedResult = await executeSaga(saga, {
      orderId: "SO-HIGH-VAL-999",
      totalAmount: 185000, // Exceeds 100K threshold
    });

    assert.equal(suspendedResult.status, "hitl_waiting");
    assert.ok(suspendedResult.hitlCheckpoint);
    assert.equal(suspendedResult.hitlCheckpoint.stepId, "create-and-sign-invoice");
    assert.match(suspendedResult.hitlCheckpoint.reason || "", /exceeds HITL threshold/);
    assert.ok(suspendedResult.suspensionContext);

    // 2. User approves HITL checkpoint
    const finalResult = await resumeSaga(
      saga,
      suspendedResult.suspensionContext!,
      { approved: true },
    );

    assert.equal(finalResult.status, "completed");
    assert.equal(finalResult.completedSteps.length, 3);
  });

  it("rolls back prior steps when user rejects HITL checkpoint", async () => {
    const compensationOrder: string[] = [];

    const hitlSaga: SagaDefinition = defineSaga({
      id: "test:hitl-reject-saga",
      name: "HITL Reject Saga",
      workspace: "test",
      description: "Tests rejection rollback",
      compensatingPolicy: "rollback_all",
      steps: [
        {
          id: "step-1-reserve",
          name: "Reserve Funds",
          contextId: "finance/funds",
          action: "reserve",
          handler: async () => ({ reserved: true }),
          compensate: async () => {
            compensationOrder.push("unreserve-funds");
          },
        },
        {
          id: "step-2-gate",
          name: "High Value Gate",
          contextId: "finance/gate",
          action: "gate",
          handler: async () => ({ value: 200000 }),
          hitlCheck: () => ({
            requiresHitl: true,
            prompt: "Confirm high value transfer",
          }),
        },
      ],
    });

    const suspended = await executeSaga(hitlSaga, {});
    assert.equal(suspended.status, "hitl_waiting");

    const rejected = await resumeSaga(
      hitlSaga,
      suspended.suspensionContext!,
      { approved: false, feedback: "Budget exceeded" },
    );

    assert.equal(rejected.status, "compensated");
    assert.deepEqual(compensationOrder, ["unreserve-funds"]);
  });

  it("manages multi-orchestrator registry isolation and prompt serialization", () => {
    clearRegistry();

    registerOrchestrator(sellingOrchestrator);
    registerOrchestrator(orderToCashOrchestrator);

    // Filter by workspace
    const sellingOrchs = listOrchestrators({ workspace: "selling" });
    assert.equal(sellingOrchs.length, 1);
    assert.equal(sellingOrchs[0].id, "selling-workspace-orchestrator");

    const globalOrchs = listOrchestrators({ workspace: "cross-workspace" });
    assert.equal(globalOrchs.length, 1);
    assert.equal(globalOrchs[0].id, "global-order-to-cash-orchestrator");

    // Retrieve specific sagas
    const domesticSaga = getSaga("selling:domestic-order-to-invoice");
    assert.ok(domesticSaga);
    assert.equal(domesticSaga.name, "Domestic Order to Invoice");

    const globalSaga = getSaga("global:order-to-cash");
    assert.ok(globalSaga);
    assert.equal(globalSaga.name, "Global Order-to-Cash Value Stream");

    // Format LLM prompts
    const prompt = formatSagaPrompt(domesticSaga);
    assert.match(prompt, /Workflow Saga: Domestic Order to Invoice/);
    assert.match(prompt, /Execution Pipeline:/);
    assert.match(prompt, /1\. \*\*Approve Sales Order\*\*/);

    const consolidated = formatAllSagasPrompt({ workspace: "selling" });
    assert.match(consolidated, /Available Workflow Sagas/);
  });

  it("resolves Turkey (TR) saga strategy, dynamically injecting GİB E-İrsaliye step and augmenting state", async () => {
    const baseSaga = sellingOrchestrator.sagas["selling:domestic-order-to-invoice"];
    assert.equal(baseSaga.steps.length, 3, "Base saga has 3 steps");

    // Resolve for TR
    const trSaga = resolveSagaStrategy(baseSaga, "TR");
    assert.equal(trSaga.steps.length, 4, "TR strategy adds 1 step (total 4)");
    assert.deepEqual(
      trSaga.steps.map((s) => s.id),
      [
        "approve-sales-order",
        "create-delivery-note",
        "gib-sign-delivery-note",
        "create-and-sign-invoice",
      ],
      "GİB step must be inserted right after create-delivery-note",
    );

    // Execute with countryCode: 'TR'
    const result = await executeSaga(
      baseSaga,
      { orderId: "SO-TR-9001", totalAmount: 28000 },
      { countryCode: "TR" },
    );

    assert.equal(result.status, "completed");
    assert.equal(result.completedSteps.length, 4);

    const gibRes = result.results["gib-sign-delivery-note"] as any;
    assert.ok(gibRes);
    assert.equal(gibRes.gibStatusCode, "1220");
    assert.equal(gibRes.gibSigned, true);
    assert.equal(gibRes.gibUuid, "GIB-UUID-SO-TR-9001");

    // Prompt includes TR step
    const trPrompt = formatSagaPrompt(baseSaga, undefined, "TR");
    assert.match(trPrompt, /GİB E-İrsaliye Gönder & İmzala/);
    assert.match(trPrompt, /Jurisdiction Strategy/);
    assert.match(trPrompt, /`TR`/);
  });

  it("resolves Germany (DE) saga strategy, dynamically injecting VIES VAT validation before invoice", async () => {
    const baseSaga = sellingOrchestrator.sagas["selling:domestic-order-to-invoice"];

    // Resolve for DE
    const deSaga = resolveSagaStrategy(baseSaga, "DE");
    assert.equal(deSaga.steps.length, 4, "DE strategy adds 1 step (total 4)");
    assert.deepEqual(
      deSaga.steps.map((s) => s.id),
      [
        "approve-sales-order",
        "create-delivery-note",
        "vies-vat-validation",
        "create-and-sign-invoice",
      ],
      "VIES step must be inserted right before create-and-sign-invoice",
    );

    // Execute with countryCode: 'DE'
    const result = await executeSaga(
      baseSaga,
      { orderId: "SO-DE-5001", totalAmount: 32000 },
      { countryCode: "DE" },
    );

    assert.equal(result.status, "completed");
    assert.equal(result.completedSteps.length, 4);

    const viesRes = result.results["vies-vat-validation"] as any;
    assert.ok(viesRes);
    assert.equal(viesRes.viesValid, true);
    assert.equal(viesRes.viesToken, "VIES-TOKEN-SO-DE-5001");

    // Prompt includes DE step
    const dePrompt = formatSagaPrompt(baseSaga, undefined, "DE");
    assert.match(dePrompt, /VIES AB KDV Numarası Doğrulama/);
    assert.match(dePrompt, /Jurisdiction Strategy/);
    assert.match(dePrompt, /`DE`/);
  });

  it("allows saga strategy to override (ezmek) existing steps and remove unneeded steps", async () => {
    const baseSaga: SagaDefinition = defineSaga({
      id: "test:override-saga",
      name: "Override Test Saga",
      workspace: "test",
      description: "Tests step overrides and removals",
      steps: [
        {
          id: "step-1",
          name: "Original Step 1",
          contextId: "test/ctx-1",
          action: "originalAction1",
          handler: async () => ({ original: true }),
        },
        {
          id: "step-2",
          name: "Original Step 2",
          contextId: "test/ctx-2",
          action: "originalAction2",
          handler: async () => ({ step2: true }),
        },
        {
          id: "step-3",
          name: "Original Step 3 to be removed",
          contextId: "test/ctx-3",
          action: "originalAction3",
        },
      ],
      strategies: {
        CUSTOM: {
          countryCode: "CUSTOM",
          removeSteps: ["step-3"],
          stepOverrides: {
            "step-1": {
              name: "Overridden Step 1 (Ezilmiş Adım)",
              action: "overriddenAction1",
              handler: async () => ({ overridden: true, customStamp: "CUSTOM-STAMP-999" }),
            },
          },
        },
      },
    });

    const resolved = resolveSagaStrategy(baseSaga, "CUSTOM");
    // Step 3 was removed
    assert.equal(resolved.steps.length, 2);
    assert.deepEqual(resolved.steps.map((s) => s.id), ["step-1", "step-2"]);

    // Step 1 was overridden
    assert.equal(resolved.steps[0].name, "Overridden Step 1 (Ezilmiş Adım)");
    assert.equal(resolved.steps[0].action, "overriddenAction1");

    // Execute resolved saga
    const result = await executeSaga(baseSaga, {}, { countryCode: "CUSTOM" });
    assert.equal(result.status, "completed");
    const step1Res = result.results["step-1"] as any;
    assert.equal(step1Res.overridden, true);
    assert.equal(step1Res.customStamp, "CUSTOM-STAMP-999");
  });
});
