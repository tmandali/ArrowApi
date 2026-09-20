/**
 * Pure metadata extraction utility for Mermaid diagrams.
 */
export interface MermaidDiagramMeta {
  type: string;
  title: string;
  lineCount: number;
}

export function detectDiagramMeta(chart: string): MermaidDiagramMeta {
  const lines = chart
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const lineCount = lines.length;

  let title = "";
  let type = "Diagram";

  for (const line of lines) {
    if (line.startsWith("%% title:") || line.startsWith("accTitle:")) {
      title = line.replace(/^(%% title:|accTitle:)\s*/, "").trim();
      break;
    }
    if (line.startsWith("title ")) {
      title = line.replace(/^title\s+/, "").trim();
      break;
    }
  }

  const firstCodeLine = lines.find((l) => !l.startsWith("%%")) || "";
  if (/^(graph|flowchart)\b/i.test(firstCodeLine)) {
    type = "Flowchart";
  } else if (/^sequenceDiagram\b/i.test(firstCodeLine)) {
    type = "Sequence";
  } else if (/^stateDiagram(-v2)?\b/i.test(firstCodeLine)) {
    type = "State";
  } else if (/^erDiagram\b/i.test(firstCodeLine)) {
    type = "ERD";
  } else if (/^classDiagram\b/i.test(firstCodeLine)) {
    type = "Class";
  } else if (/^gantt\b/i.test(firstCodeLine)) {
    type = "Gantt";
  }

  if (!title) {
    title = `${type} Diagram`;
  }

  return { type, title, lineCount };
}
