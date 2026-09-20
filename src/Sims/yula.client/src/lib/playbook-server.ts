import fs from "node:fs/promises";
import path from "node:path";
import {
  PlaybookService,
  PlaybookDAG,
  type WorkflowGraphData,
  type IPlaybookStorageAdapter,
  type PlaybookEntry,
  type PlaybookIndexItem,
  type PlaybookLogItem,
  type PlaybookScope,
} from "@my-agent/core";

/**
 * Sunucu tarafında Markdown tabanlı Playbook deposu.
 * Karpathy'nin "LLM Wiki" mimarisine uygun olarak:
 * storage/wiki/workspaces/<workspaceId>/
 *   ├── index.md (Katalog)
 *   ├── log.md (Zaman çizelgesi)
 *   ├── screens/*.md (Ekran kuralları)
 *   └── workflows/*.md (İş akışı reçeteleri)
 */
export class ServerFsPlaybookStorage implements IPlaybookStorageAdapter {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir =
      customBaseDir || path.join(process.cwd(), "storage", "wiki");
  }

  private getWorkspaceDir(workspaceId: string, scope: PlaybookScope = "workspace"): string {
    return path.join(this.baseDir, scope === "user" ? "users" : "workspaces", workspaceId);
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch {
      // Dizin zaten varsa hata fırlatma
    }
  }

  async readEntries(workspaceId: string, scope?: PlaybookScope): Promise<PlaybookEntry[]> {
    const wsDir = this.getWorkspaceDir(workspaceId, scope);
    const entries: PlaybookEntry[] = [];

    const subdirs = ["screens", "workflows", "policies"];
    for (const sub of subdirs) {
      const subPath = path.join(wsDir, sub);
      try {
        const files = await fs.readdir(subPath);
        for (const file of files) {
          if (!file.endsWith(".md")) continue;
          const fullPath = path.join(subPath, file);
          const raw = await fs.readFile(fullPath, "utf-8");
          const parsed = this.parseMarkdownFile(raw, file, workspaceId, scope || "workspace");
          if (parsed) entries.push(parsed);
        }
      } catch {
        // Alt dizin yoksa devam et
      }
    }

    return entries;
  }

  async writeEntry(entry: PlaybookEntry): Promise<void> {
    const wsDir = this.getWorkspaceDir(entry.workspaceId, entry.scope);
    const sub =
      entry.category === "screen_rule"
        ? "screens"
        : entry.category === "workflow_recipe"
          ? "workflows"
          : "policies";
    const subDir = path.join(wsDir, sub);
    await this.ensureDir(subDir);

    const filename = `${entry.id}.md`;
    const filePath = path.join(subDir, filename);
    const content = this.serializeMarkdownFile(entry);
    await fs.writeFile(filePath, content, "utf-8");
  }

  async deleteEntry(id: string, workspaceId: string): Promise<boolean> {
    const wsDir = this.getWorkspaceDir(workspaceId);
    const subdirs = ["screens", "workflows", "policies"];
    for (const sub of subdirs) {
      const filePath = path.join(wsDir, sub, `${id}.md`);
      try {
        await fs.unlink(filePath);
        return true;
      } catch {
        // Dosya bu klasörde değilse sonrakine bak
      }
    }
    return false;
  }

  async readIndex(workspaceId: string): Promise<PlaybookIndexItem[]> {
    const wsDir = this.getWorkspaceDir(workspaceId);
    const indexPath = path.join(wsDir, "index.md");
    try {
      const raw = await fs.readFile(indexPath, "utf-8");
      return this.parseIndexMarkdown(raw);
    } catch {
      return [];
    }
  }

  async writeIndex(workspaceId: string, items: PlaybookIndexItem[]): Promise<void> {
    const wsDir = this.getWorkspaceDir(workspaceId);
    await this.ensureDir(wsDir);
    const indexPath = path.join(wsDir, "index.md");

    const lines = [
      `# Playbook Kataloğu (${workspaceId.toUpperCase()})`,
      "",
      `> Bu dosya Yula AI Playbook motoru tarafından otomatik güncellenir.`,
      "",
      "| Tür | Başlık | Hedef Ekran | Dosya | Özet |",
      "| :--- | :--- | :--- | :--- | :--- |",
      ...items.map(
        (i) =>
          `| \`${i.category}\` | **${i.title}** | \`${i.targetPath || "-"}\` | [${path.basename(i.relativePath)}](${i.relativePath}) | ${i.summary.replace(/\|/g, "/")} |`,
      ),
      "",
    ];

    await fs.writeFile(indexPath, lines.join("\n"), "utf-8");
  }

  async readLog(workspaceId: string): Promise<PlaybookLogItem[]> {
    const wsDir = this.getWorkspaceDir(workspaceId);
    const logPath = path.join(wsDir, "log.md");
    try {
      const raw = await fs.readFile(logPath, "utf-8");
      return this.parseLogMarkdown(raw);
    } catch {
      return [];
    }
  }

  async appendLog(workspaceId: string, item: PlaybookLogItem): Promise<void> {
    const wsDir = this.getWorkspaceDir(workspaceId);
    await this.ensureDir(wsDir);
    const logPath = path.join(wsDir, "log.md");

    const dateStr = item.timestamp.split("T")[0];
    const line = `## [${dateStr}] ${item.action} | ${item.title}${item.targetPath ? ` (${item.targetPath})` : ""} - ${item.author || "Yula"}\n`;

    try {
      await fs.appendFile(logPath, line, "utf-8");
    } catch {
      await fs.writeFile(logPath, `# Playbook Denetim İzi (Log)\n\n${line}`, "utf-8");
    }
  }

  // --- Yardımcı Markdown Ayrıştırma ve Formatlama ---

  private parseMarkdownFile(
    raw: string,
    filename: string,
    workspaceId: string,
    scope: PlaybookScope,
  ): PlaybookEntry | null {
    const id = filename.replace(/\.md$/, "");
    const lines = raw.split("\n");

    let title = id;
    let category: PlaybookEntry["category"] = "screen_rule";
    let targetPath: string | undefined;
    let contentStart = 0;

    // Basit frontmatter ayrıştırma (varsa)
    if (lines[0]?.trim() === "---") {
      let fmEnd = -1;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trim() === "---") {
          fmEnd = i;
          break;
        }
        const [k, ...rest] = lines[i].split(":");
        const v = rest.join(":").trim();
        if (k.trim() === "title") title = v.replace(/^["']|["']$/g, "");
        if (k.trim() === "category") category = v.replace(/^["']|["']$/g, "") as any;
        if (k.trim() === "targetPath") targetPath = v.replace(/^["']|["']$/g, "");
      }
      if (fmEnd !== -1) contentStart = fmEnd + 1;
    }

    const contentMarkdown = lines.slice(contentStart).join("\n").trim();
    let graph: WorkflowGraphData | undefined;
    if (category === "workflow_recipe" && contentMarkdown) {
      const dag = PlaybookDAG.fromMarkdownSteps(contentMarkdown);
      if (dag.getAllNodes().length > 0) {
        graph = dag.toJSON();
      }
    }

    return {
      id,
      scope,
      workspaceId,
      category,
      title,
      targetPath,
      contentMarkdown,
      graph,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private serializeMarkdownFile(entry: PlaybookEntry): string {
    const frontmatter = [
      "---",
      `id: "${entry.id}"`,
      `title: "${entry.title}"`,
      `category: "${entry.category}"`,
      `scope: "${entry.scope}"`,
      entry.targetPath ? `targetPath: "${entry.targetPath}"` : null,
      entry.author ? `author: "${entry.author}"` : null,
      "---",
      "",
    ]
      .filter(Boolean)
      .join("\n");

    const content =
      entry.contentMarkdown ||
      (entry.graph ? new PlaybookDAG(entry.graph).toMarkdownSteps() : "");

    return `${frontmatter}${content}\n`;
  }

  private parseIndexMarkdown(raw: string): PlaybookIndexItem[] {
    const items: PlaybookIndexItem[] = [];
    const lines = raw.split("\n");
    for (const line of lines) {
      if (!line.startsWith("|") || line.includes(":---") || line.includes("Başlık")) {
        continue;
      }
      const parts = line
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 5) {
        const category = parts[0].replace(/[`]/g, "") as any;
        const title = parts[1].replace(/[*]/g, "");
        const targetPath = parts[2] !== "-" ? parts[2].replace(/[`]/g, "") : undefined;
        const matchFile = parts[3].match(/\((.*?)\)/);
        const relativePath = matchFile ? matchFile[1] : parts[3];
        const summary = parts[4];
        const id = path.basename(relativePath, ".md");
        items.push({ id, title, category, targetPath, summary, relativePath });
      }
    }
    return items;
  }

  private parseLogMarkdown(raw: string): PlaybookLogItem[] {
    const items: PlaybookLogItem[] = [];
    const lines = raw.split("\n");
    for (const line of lines) {
      if (!line.startsWith("## [")) continue;
      const match = line.match(/## \[(.*?)\] (.*?) \| (.*?)(?: - (.*))?$/);
      if (match) {
        items.push({
          timestamp: match[1],
          action: match[2] as any,
          title: match[3],
          author: match[4] || "Yula",
        });
      }
    }
    return items;
  }
}

/** Sunucu tarafında singleton depolama adaptörü */
export const serverPlaybookStorage = new ServerFsPlaybookStorage();

/** Sunucu tarafında singleton playbook servisi */
export const serverPlaybookService = new PlaybookService(serverPlaybookStorage);
