// /home/dev/.pi/agent/extensions/auto-warmup.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Auto-send a greeting when a brand-new, empty chat opens in the TUI so the
// first turn is primed without typing "hi" manually.
//   PI_AUTO_WARMUP=0          disable
//   PI_AUTO_WARMUP_TEXT="..." override the greeting (default "hi")
const WARMUP_DELAY_MS = 400;

type EntryLike = { type?: string };
type SessionManagerLike = {
  getBranch?(): EntryLike[];
  getEntries?(): EntryLike[];
};

export default function autoWarmupExtension(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  pi.on("session_start", (event, ctx) => {
    cancel();
    if (process.env.PI_AUTO_WARMUP === "0") return;
    if (event.reason !== "startup" && event.reason !== "new") return;
    if (ctx.mode !== "tui") return;

    const sm = ctx.sessionManager as unknown as SessionManagerLike;
    const entries = sm.getBranch?.() ?? sm.getEntries?.() ?? [];
    if (entries.some((e) => e?.type === "message")) return;

    const text = process.env.PI_AUTO_WARMUP_TEXT?.trim() || "hi";
    // Defer so the TUI finishes rendering before the first turn starts.
    timer = setTimeout(() => {
      timer = undefined;
      try {
        if (!ctx.isIdle() || ctx.hasPendingMessages()) return;
      } catch {
        return; // ctx went stale (session replaced/reloaded)
      }
      pi.sendUserMessage(text);
    }, WARMUP_DELAY_MS);
  });

  pi.on("session_shutdown", cancel);
}
