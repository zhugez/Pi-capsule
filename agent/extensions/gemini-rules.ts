// /home/dev/.pi/agent/extensions/gemini-rules.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function geminiRulesExtension(pi: ExtensionAPI) {
  const rulesPath = path.join(os.homedir(), ".gemini", "GEMINI.md");
  let cachedRules: string | undefined;
  let cachedMtimeMs = -1;

  function loadRules(): string | undefined {
    try {
      const stat = fs.statSync(rulesPath);
      if (cachedRules === undefined || stat.mtimeMs !== cachedMtimeMs) {
        cachedRules = fs.readFileSync(rulesPath, "utf-8");
        cachedMtimeMs = stat.mtimeMs;
      }
      return cachedRules;
    } catch {
      return cachedRules;
    }
  }

  pi.on("before_agent_start", (event, ctx) => {
    const isGemini =
      ctx.model?.provider === "antigravity" ||
      ctx.model?.id?.toLowerCase().includes("gemini");

    if (!isGemini) return;

    const rules = loadRules();
    if (!rules) return;
    return { systemPrompt: `${rules}\n\n${event.systemPrompt}` };
  });
}
