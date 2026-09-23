/**
 * Multi-Orchestrator & Saga Registry
 * 
 * Central registry enabling discovery and execution of Workspace-Level
 * and Cross-Workspace (Enterprise) Sagas.
 */

import type {
  SagaOrchestrator,
  SagaDefinition,
} from "../contracts/workflow-orchestrator";
import { formatSagaPrompt } from "../contracts/workflow-orchestrator";

// ---------------------------------------------------------------------------
// Registry Storage
// ---------------------------------------------------------------------------

const orchestratorRegistry = new Map<string, SagaOrchestrator>();

// ---------------------------------------------------------------------------
// Registry API
// ---------------------------------------------------------------------------

/**
 * Registers an orchestrator containing one or more sagas.
 */
export function registerOrchestrator(orchestrator: SagaOrchestrator): void {
  orchestratorRegistry.set(orchestrator.id, orchestrator);
}

/**
 * Retrieves an orchestrator by its unique id.
 */
export function getOrchestrator(id: string): SagaOrchestrator | undefined {
  return orchestratorRegistry.get(id);
}

/**
 * Lists all registered orchestrators, optionally filtered by workspace.
 */
export function listOrchestrators(filter?: {
  workspace?: string;
}): SagaOrchestrator[] {
  const all = Array.from(orchestratorRegistry.values());
  if (!filter?.workspace) {
    return all;
  }
  return all.filter((o) => o.workspace === filter.workspace);
}

/**
 * Retrieves a specific saga definition by searching through all registered orchestrators.
 * Saga ID format: `<workspace>:<saga-name>` or `<global>:<saga-name>`
 */
export function getSaga(sagaId: string): SagaDefinition | undefined {
  for (const orchestrator of orchestratorRegistry.values()) {
    if (orchestrator.sagas[sagaId]) {
      return orchestrator.sagas[sagaId];
    }
    // Also check direct object keys if different from id
    for (const saga of Object.values(orchestrator.sagas)) {
      if (saga.id === sagaId) {
        return saga;
      }
    }
  }
  return undefined;
}

/**
 * Lists all sagas across registered orchestrators, optionally filtered by workspace.
 */
export function listSagas(filter?: { workspace?: string }): SagaDefinition[] {
  const sagas: SagaDefinition[] = [];
  const orchestrators = listOrchestrators(filter);

  for (const orch of orchestrators) {
    sagas.push(...Object.values(orch.sagas));
  }

  return sagas;
}

/**
 * Formats all matching sagas into a consolidated prompt section for the LLM agent.
 */
export function formatAllSagasPrompt(
  filter?: { workspace?: string },
  t?: (key: string) => string,
): string {
  const sagas = listSagas(filter);
  if (sagas.length === 0) {
    return "";
  }

  const sections: string[] = [
    "## 🔄 Available Workflow Sagas (Multi-Step Orchestrations)",
    "The following multi-step business value streams are available in this context:",
    "",
  ];

  for (const saga of sagas) {
    sections.push(formatSagaPrompt(saga, t));
    sections.push("---");
  }

  return sections.join("\n");
}

/**
 * Clears the registry (primarily for test isolation).
 */
export function clearRegistry(): void {
  orchestratorRegistry.clear();
}
