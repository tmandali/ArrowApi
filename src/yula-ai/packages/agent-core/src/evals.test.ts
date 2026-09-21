import { describe, it, expect } from 'vitest';
import {
  EvalRunner,
  type EvalTestCase,
  type EvalExecutionResult,
} from './evals';

describe('AgentArch Eval Engine (evals.ts)', () => {
  const runner = new EvalRunner();

  it('should compute acceptableScore = 1 when tool, args, and final decision match', () => {
    const testCase: EvalTestCase = {
      id: 'test_leave_approval',
      name: 'Leave Approval Test',
      category: 'positive_action',
      prompt: 'Approve Sarah leave for 3 days',
      expectedAction: {
        componentId: 'leave_service',
        action: 'APPROVE',
        payloadMatcher: (p) => p?.days === 3 && p?.employee === 'Sarah',
      },
      expectedDecision: (msg) => msg.includes('Leave approved'),
    };

    const execution: EvalExecutionResult = {
      dispatchedActions: [
        { componentId: 'leave_service', action: 'APPROVE', payload: { days: 3, employee: 'Sarah' } },
      ],
      responseMessage: 'Leave approved successfully.',
    };

    const result = runner.evaluateExecution(testCase, execution, 100);
    expect(result.correctToolChoice).toBe(true);
    expect(result.correctToolArguments).toBe(true);
    expect(result.correctFinalDecision).toBe(true);
    expect(result.acceptableScore).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('should penalize extraneous write actions in lenient mode but allow read-only tools', () => {
    const testCase: EvalTestCase = {
      id: 'test_lenient',
      name: 'Lenient Tool Choice Test',
      category: 'positive_action',
      prompt: 'Check balance and submit',
      evaluationMode: 'lenient',
      expectedAction: {
        componentId: 'criteria_form',
        action: 'SUBMIT',
      },
    };

    // Case A: With allowed read-only inspection -> should pass
    const executionWithReadOnly: EvalExecutionResult = {
      dispatchedActions: [
        { componentId: 'state_inspector', action: 'inspect_ui_state', payload: {} },
        { componentId: 'criteria_form', action: 'SUBMIT', payload: {} },
      ],
      responseMessage: 'Submitted',
    };
    const resA = runner.evaluateExecution(testCase, executionWithReadOnly, 50);
    expect(resA.correctToolChoice).toBe(true);
    expect(resA.acceptableScore).toBe(1);

    // Case B: With extraneous mutation action -> should fail tool choice
    const executionWithExtraMutation: EvalExecutionResult = {
      dispatchedActions: [
        { componentId: 'random_form', action: 'DELETE_ALL', payload: {} },
        { componentId: 'criteria_form', action: 'SUBMIT', payload: {} },
      ],
      responseMessage: 'Submitted',
    };
    const resB = runner.evaluateExecution(testCase, executionWithExtraMutation, 50);
    expect(resB.correctToolChoice).toBe(false);
    expect(resB.acceptableScore).toBe(0);
  });

  it('should detect repeated consecutive tool calls', () => {
    const testCase: EvalTestCase = {
      id: 'test_repetition',
      name: 'Repetition Guard',
      category: 'positive_action',
      prompt: 'Fetch inventory',
      expectedAction: { componentId: 'grid', action: 'FETCH' },
    };

    const execution: EvalExecutionResult = {
      dispatchedActions: [
        { componentId: 'grid', action: 'FETCH', payload: { id: 1 } },
        { componentId: 'grid', action: 'FETCH', payload: { id: 1 } },
      ],
      responseMessage: 'Done',
    };

    const result = runner.evaluateExecution(testCase, execution, 60);
    expect(result.repeatedConsecutiveCalls).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('should compute pass@1 and pass^k reliability metrics over multiple trials', async () => {
    const testCases: EvalTestCase[] = [
      {
        id: 'reliable_case',
        name: 'Deterministic Flow',
        category: 'positive_action',
        prompt: 'Task A',
        expectedAction: { componentId: 'tool_a', action: 'RUN' },
      },
      {
        id: 'unreliable_case',
        name: 'Flaky Flow',
        category: 'positive_action',
        prompt: 'Task B',
        expectedAction: { componentId: 'tool_b', action: 'RUN' },
      },
    ];

    let trialCountB = 0;
    const mockExecutor = async (prompt: string): Promise<EvalExecutionResult> => {
      if (prompt === 'Task A') {
        return {
          dispatchedActions: [{ componentId: 'tool_a', action: 'RUN' }],
          responseMessage: 'OK',
        };
      }
      trialCountB++;
      // Task B succeeds only on trial 1, fails on trial 2 & 3
      if (trialCountB === 1) {
        return {
          dispatchedActions: [{ componentId: 'tool_b', action: 'RUN' }],
          responseMessage: 'OK',
        };
      }
      return {
        dispatchedActions: [{ componentId: 'wrong_tool', action: 'WRONG' }],
        responseMessage: 'Failed',
      };
    };

    const k = 3;
    const reliability = await runner.runReliabilityPassK(testCases, k, mockExecutor);

    expect(reliability.k).toBe(3);
    expect(reliability.totalCases).toBe(2);
    // Task A: 3/3 passed. Task B: 1/3 passed. Total = 4/6 = 67%
    expect(reliability.passAt1).toBe(67);
    // Only Task A passed all 3 trials: 1 out of 2 = 50%
    expect(reliability.passHatK).toBe(50);
  });
});
