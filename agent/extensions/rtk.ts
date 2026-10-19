// /home/dev/.pi/agent/extensions/rtk.ts
// RTK Pi extension — rewrites bash commands to use rtk for token savings.
// Requires: rtk >= 0.23.0 in PATH.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const REWRITE_TIMEOUT_MS = 2_000;
const MIN_SUPPORTED_RTK_MINOR = 23;

async function rewriteCommand(
  pi: ExtensionAPI,
  cmd: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const result = await pi.exec("rtk", ["rewrite", cmd], {
    timeout: REWRITE_TIMEOUT_MS,
    signal,
  });
  if (result.killed || (result.code !== 0 && result.code !== 3)) return null;
  return result.stdout.trim() || null;
}

export default function (pi: ExtensionAPI) {
  let rtkState: "unchecked" | "ready" | "disabled" = "unchecked";

  async function ensureRtkReady(signal?: AbortSignal): Promise<boolean> {
    if (rtkState === "ready") return true;
    if (rtkState === "disabled") return false;

    const ver = await pi.exec("rtk", ["--version"], {
      timeout: REWRITE_TIMEOUT_MS,
      signal,
    });
    if (ver.code !== 0) {
      console.warn("[rtk] rtk binary not found in PATH — extension disabled");
      rtkState = "disabled";
      return false;
    }

    const [, major, minor] = ver.stdout.match(/(\d+)\.(\d+)/) ?? [];
    if (major === "0" && Number(minor) < MIN_SUPPORTED_RTK_MINOR) {
      console.warn(
        `[rtk] rtk ${ver.stdout.trim()} is too old (need >= 0.23.0) — extension disabled`,
      );
      rtkState = "disabled";
      return false;
    }

    rtkState = "ready";
    return true;
  }

  pi.on("tool_call", async (event, ctx) => {
    try {
      if (!isToolCallEventType("bash", event)) return;

      const cmd = event.input.command;
      if (typeof cmd !== "string" || cmd.trim() === "") return;

      if (cmd.startsWith("rtk ")) return;
      if (process.env.RTK_DISABLED === "1") return;
      if (!(await ensureRtkReady(ctx.signal))) return;

      const rewritten = await rewriteCommand(pi, cmd, ctx.signal);
      if (rewritten && rewritten !== cmd) {
        event.input.command = rewritten;
      }
    } catch (err) {
      console.warn(
        "[rtk] unexpected error in tool_call handler; passing through command",
        err,
      );
    }
  });
}
