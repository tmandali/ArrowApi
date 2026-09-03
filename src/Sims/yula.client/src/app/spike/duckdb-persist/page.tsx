import { DuckDbPersistBench } from "./duckdb-persist-bench";

export default function DuckDbPersistPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto">
      <DuckDbPersistBench />
    </div>
  );
}
