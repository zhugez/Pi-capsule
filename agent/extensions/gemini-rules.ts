// /home/dev/.pi/agent/extensions/gemini-rules.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function geminiRulesExtension(pi: ExtensionAPI) {
  const geminiDir = path.join(os.homedir(), ".gemini");
  const rulesPath = path.join(geminiDir, "GEMINI.md");
  const corePath = path.join(geminiDir, "references", "core.md");
  const claudeRulesPath = path.join(geminiDir, "CLAUDE_OPUS.md");
  const cache = new Map<string, { content?: string; mtimeMs: number }>();

  function loadFileCached(filePath: string): string | undefined {
    const entry = cache.get(filePath) ?? { mtimeMs: -1 };
    try {
      const stat = fs.statSync(filePath);
      if (entry.content === undefined || stat.mtimeMs !== entry.mtimeMs) {
        entry.content = fs.readFileSync(filePath, "utf-8");
        entry.mtimeMs = stat.mtimeMs;
        cache.set(filePath, entry);
      }
      return entry.content;
    } catch {
      return entry.content;
    }
  }

  pi.on("before_agent_start", (event, ctx) => {
    const modelId = ctx.model?.id?.toLowerCase() ?? "";
    const isGemini = modelId.includes("gemini");
    const isClaude = modelId.includes("claude") || modelId.includes("opus");
    const sections = event?.systemPromptOptions?.sections;

    if (!isGemini && !isClaude) {
      if (sections && typeof sections === "object") delete sections.gemini_rules;
      return;
    }

    const primary = loadFileCached(isClaude ? claudeRulesPath : rulesPath);
    if (!primary) return;
    const core = !isClaude ? loadFileCached(corePath) : undefined;
    const rulesContent = core
      ? `${primary.trim()}\n\n---\n\n### Preloaded Session Baseline (~/.gemini/references/core.md)\n\n${core.trim()}`
      : primary;

    if (sections && typeof sections === "object") {
      sections.gemini_rules = rulesContent;
      return;
    }
    return { systemPrompt: `${event.systemPrompt}\n\n${rulesContent}` };
  });

  // Keep <gemini_rules> at the tail of structured system sections for maximum recency weight.
  pi.on("context_with_system", (event, ctx) => {
    const modelId = ctx.model?.id?.toLowerCase() ?? "";
    if (!/gemini|claude|opus/.test(modelId)) return;

    const first = event.messages?.[0] as { role?: string; sections?: Record<string, string> } | undefined;
    if (first?.role === "system" && first.sections && "gemini_rules" in first.sections) {
      const geminiSection = first.sections.gemini_rules;
      delete first.sections.gemini_rules;
      first.sections.gemini_rules = geminiSection;
    }
  });
}
