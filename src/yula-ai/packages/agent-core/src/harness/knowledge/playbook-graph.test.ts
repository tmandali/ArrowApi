import { describe, it, expect } from 'vitest';
import { PlaybookDAG, type WorkflowGraphData } from './playbook-graph';

describe('PlaybookDAG', () => {
  it('constructs a valid DAG and performs topological sorting', () => {
    const dag = new PlaybookDAG();

    dag.addNode({ id: 'step_1', type: 'action', label: 'Open Screen', action: 'navigate:/test' });
    dag.addNode({ id: 'step_2', type: 'action', label: 'Set Filters', action: 'criteria_form:SET_FIELDS' });
    dag.addNode({ id: 'step_3', type: 'hitl', label: 'User Confirmation' });
    dag.addNode({ id: 'step_4', type: 'action', label: 'Execute Query', action: 'dispatch_action' });

    dag.addEdge({ id: 'e1', source: 'step_1', target: 'step_2' });
    dag.addEdge({ id: 'e2', source: 'step_2', target: 'step_3' });
    dag.addEdge({ id: 'e3', source: 'step_3', target: 'step_4' });

    expect(dag.hasCycle()).toBe(false);

    const sorted = dag.topologicalSort();
    expect(sorted.map((s) => s.id)).toEqual(['step_1', 'step_2', 'step_3', 'step_4']);

    const validation = dag.validate();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('detects cycles and refuses topological sorting when a cycle exists', () => {
    const dag = new PlaybookDAG();

    dag.addNode({ id: 'node_a', type: 'action', label: 'A' });
    dag.addNode({ id: 'node_b', type: 'action', label: 'B' });
    dag.addNode({ id: 'node_c', type: 'condition', label: 'C' });

    dag.addEdge({ id: 'e_ab', source: 'node_a', target: 'node_b' });
    dag.addEdge({ id: 'e_bc', source: 'node_b', target: 'node_c' });
    dag.addEdge({ id: 'e_ca', source: 'node_c', target: 'node_a' }); // Cycle back to A!

    expect(dag.hasCycle()).toBe(true);
    expect(() => dag.topologicalSort()).toThrow('Cannot perform topological sort on a graph with cycles.');

    const validation = dag.validate();
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Circular dependency detected in workflow graph.');
  });

  it('validates missing edge endpoints', () => {
    const dag = new PlaybookDAG();

    dag.addNode({ id: 'step_1', type: 'action', label: 'Start' });
    dag.addEdge({ id: 'e_broken', source: 'step_1', target: 'step_missing' });

    const validation = dag.validate();
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('missing target node');
  });

  it('parses structured steps from markdown and handles dependencies', () => {
    const markdown = `
# Sample Workflow
1. [open_view] (action) Open View -> navigate:/reports
2. [fill_form] (action) Fill Form (dependsOn: open_view) -> criteria_form:SET_FIELDS
3. [confirm] (hitl) Review & Confirm (dependsOn: fill_form)
4. [run_job] (action) Run Job (dependsOn: confirm) -> jobs:RUN
`;

    const dag = PlaybookDAG.fromMarkdownSteps(markdown);
    expect(dag.getAllNodes()).toHaveLength(4);
    expect(dag.hasCycle()).toBe(false);

    const sorted = dag.topologicalSort();
    expect(sorted.map((n) => n.id)).toEqual(['open_view', 'fill_form', 'confirm', 'run_job']);

    const exportedMd = dag.toMarkdownSteps();
    expect(exportedMd).toContain('[open_view]');
    expect(exportedMd).toContain('(dependsOn: open_view)');
  });

  it('serializes to and from JSON', () => {
    const rawData: WorkflowGraphData = {
      nodes: [
        { id: 'n1', type: 'action', label: 'Action 1' },
        { id: 'n2', type: 'terminal', label: 'End' },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    };

    const dag = PlaybookDAG.fromJSON(rawData);
    expect(dag.getAllNodes()).toHaveLength(2);
    expect(dag.getAllEdges()).toHaveLength(1);
    expect(dag.toJSON()).toEqual(rawData);
  });
});
