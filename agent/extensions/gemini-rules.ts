import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function geminiRulesExtension(pi: ExtensionAPI) {
  const rulesPath = path.join(os.homedir(), ".gemini", "GEMINI.md");

  pi.on("before_agent_start", (event, ctx) => {
    const isGemini =
      ctx.model?.provider === "antigravity" ||
      ctx.model?.id?.toLowerCase().includes("gemini");

    if (!isGemini) return;

    try {
      const rules = fs.readFileSync(rulesPath, "utf-8");
      return { systemPrompt: `${rules}\n\n${event.systemPrompt}` };
    } catch {
      return;
    }
  });
}


