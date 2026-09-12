import { AgentDebugBench } from "./agent-debug-bench";
import { notFound } from "next/navigation";

/** Geliştirme bench'i — yalnızca `NEXT_PUBLIC_ENABLE_SPIKES=true` build'lerinde erişilebilir. */
export default function AgentDebugPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_SPIKES !== "true") notFound();
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto">
      <AgentDebugBench />
    </div>
  );
}
