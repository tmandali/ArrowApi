import { AgentDebugBench } from "./agent-debug-bench";

export default function AgentDebugPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto">
      <AgentDebugBench />
    </div>
  );
}
