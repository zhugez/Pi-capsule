import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Slash command: /gitleaks [dir|staged|git]
  pi.registerCommand("gitleaks", {
    description: "Scan repository or staged diff for leaked secrets (/gitleaks [staged|git|dir])",
    handler: async (args, ctx) => {
      const mode = args.trim().toLowerCase();
      const gitleaksArgs =
        mode === "staged"
          ? ["protect", "--staged", "-v"]
          : mode === "git"
            ? ["git", "-v"]
            : ["dir", "-v", "."];

      if (ctx.hasUI) {
        ctx.ui.notify(`Scanning with Gitleaks (${mode || "workspace"})...`, "info");
      }

      try {
        const result = await pi.exec("gitleaks", gitleaksArgs, { timeout: 15_000 });
        if (result.code === 0) {
          const report = "[gitleaks] ✓ No leaks detected. Safe to commit.";
          if (ctx.hasUI) ctx.ui.notify(report, "info");
        } else {
          const output = (result.stdout + "\n" + result.stderr).trim();
          const report = `[gitleaks] ⚠ Leaks detected!\n\n${output.slice(0, 1500)}`;
          if (ctx.hasUI) ctx.ui.notify(report, "error");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (ctx.hasUI) ctx.ui.notify(`[gitleaks] Execution failed: ${msg}`, "warning");
      }
    },
  });

  // Intercept bash tool calls: scan staged diff before any `git commit` executes
  pi.on("tool_call", async (event, ctx) => {
    try {
      if (!isToolCallEventType("bash", event)) return;
      const cmd = event.input.command;
      if (typeof cmd !== "string" || !/\bgit\s+commit\b/.test(cmd)) return;

      const scan = await pi.exec("gitleaks", ["protect", "--staged", "-v"], {
        timeout: 8_000,
        signal: ctx.signal,
      });

      if (scan.code !== 0) {
        const details = (scan.stdout + "\n" + scan.stderr).trim();
        throw new Error(
          `[gitleaks] Commit aborted: Secret or credential leak detected in staged changes!\n\n${details.slice(0, 1000)}`,
        );
      }
    } catch (err) {
      // If gitleaks binary is not installed, fail open so git hook handles it
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "ENOENT") {
        return;
      }
      throw err;
    }
  });
}
