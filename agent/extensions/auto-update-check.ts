import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Periodically check and auto-update pi extensions in the background.
// Set PI_AUTO_UPDATE_EXTENSIONS=0 to disable.
// Set PI_AUTO_UPDATE_INTERVAL_MS to override the interval (default: 6 hours).
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 15 * 1000;

export default function autoUpdateCheckExtension(pi: ExtensionAPI) {
  let intervalTimer: ReturnType<typeof setInterval> | undefined;
  let initialTimer: ReturnType<typeof setTimeout> | undefined;

  const runUpdate = () => {
    if (process.env.PI_AUTO_UPDATE_EXTENSIONS === "0") return;

    execFile("pi", ["update", "--extensions"], (err, stdout) => {
      if (err) return;
      if (stdout && stdout.includes("Updated")) {
        console.log(`[auto-update] ${stdout.trim()}`);
      }
    });
  };

  pi.on("session_start", (event, ctx) => {
    if (event.reason !== "startup" && event.reason !== "new") return;
    if (ctx.mode !== "tui") return;

    const intervalMs = Number(process.env.PI_AUTO_UPDATE_INTERVAL_MS) || DEFAULT_INTERVAL_MS;

    if (!initialTimer && !intervalTimer) {
      initialTimer = setTimeout(() => {
        initialTimer = undefined;
        runUpdate();
        intervalTimer = setInterval(runUpdate, intervalMs);
      }, INITIAL_DELAY_MS);
    }
  });

  pi.on("session_shutdown", () => {
    if (initialTimer) clearTimeout(initialTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    initialTimer = undefined;
    intervalTimer = undefined;
  });
}
