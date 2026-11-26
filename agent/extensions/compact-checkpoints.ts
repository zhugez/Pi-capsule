import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compact, getAgentDir, SettingsManager, stripFrontmatter, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

const statusKey = "compact-checkpoints";
const handoffWindows = new Map([
	["codex-pool/gpt-6.2-sol", 1_050_000],
	["cliproxy/gemini-3.8-flash-high", 1_000_000],
	["tuoke/gpt-6.1-sol", 1_000_000],
	["tuoke/gpt-6-sol", 1_000_000],
	["xingchiapi/gpt-6.1-sol", 1_000_000],
]);

function handoffReserve(model: ExtensionContext["model"]) {
	if (model && handoffWindows.get(`${model.provider}/${model.id}`) === model.contextWindow) {
		return model.contextWindow * 7 / 10;
	}
}

function warn(ctx: ExtensionContext, message: string, error: unknown) {
	const warning = `${message}: ${error instanceof Error ? error.message : String(error)}`;
	if (ctx.hasUI) ctx.ui.notify(warning, "warning");
	else console.error(warning);
}

export default function (pi: ExtensionAPI) {
	let settings: SettingsManager | undefined;
	let dockAvailable = false;
	let lastCtx: ExtensionContext | undefined;
	let unsubscribeDock: (() => void) | undefined;
	let unsubscribeSnapshot: (() => void) | undefined;
	function subscribeDock() {
		unsubscribeDock?.();
		unsubscribeSnapshot?.();
		unsubscribeDock = pi.events?.on("pi-pulse:telemetry-dock:v1", (event: unknown) => {
			if (!event || typeof event !== "object" || !("available" in event) || typeof event.available !== "boolean" || event.available === dockAvailable) return;
			dockAvailable = event.available;
			if (lastCtx) updateStatus(lastCtx);
		});
		unsubscribeSnapshot = pi.events?.on("pi-pulse:telemetry-request:v1", () => { if (lastCtx) updateStatus(lastCtx); });
	}
	subscribeDock();

	const getSettings = (ctx: ExtensionContext) => settings ??= SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });

	function updateStatus(ctx: ExtensionContext) {
		if (ctx.mode !== "tui") return;
		lastCtx = ctx;
		const scope = `${ctx.sessionManager?.getSessionId?.() ?? ""}:${ctx.model?.provider ?? ""}/${ctx.model?.id ?? ""}`;
		const reserve = handoffReserve(ctx.model);
		const usage = reserve !== undefined && getSettings(ctx).getCompactionReserveTokens(ctx.model) === reserve ? ctx.getContextUsage() : undefined;
		if (!usage || reserve === undefined) {
			pi.events?.emit("pi-pulse:telemetry:v1", { kind: "compact", scope, data: null });
			ctx.ui.setStatus(statusKey, undefined);
			return;
		}
		const limit = usage.contextWindow - reserve;
		pi.events?.emit("pi-pulse:telemetry:v1", { kind: "compact", scope, data: { tokens: usage.tokens, limit, contextWindow: usage.contextWindow } });
		if (dockAvailable) { ctx.ui.setStatus(statusKey, undefined); return; }
		const threshold = Number(((limit / usage.contextWindow) * 100).toFixed(1));
		const remaining = usage.tokens === null
			? "usage unknown"
			: usage.tokens > limit
				? "over threshold"
				: `~${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(limit - usage.tokens + 1).replace("K", "k")} left`;
		const { theme } = ctx.ui;
		const detailColor = usage.tokens === null ? "dim" : usage.tokens > limit ? "warning" : "muted";
		ctx.ui.setStatus(statusKey, `${theme.fg("muted", "Compact")} ${theme.fg("accent", `${threshold}%`)}${theme.fg("dim", " · ")}${theme.fg(detailColor, remaining)}`);
	}

	pi.on("session_start", (_event, ctx) => {
		subscribeDock();
		settings = undefined;
		updateStatus(ctx);
	});
	pi.on("model_select", (_event, ctx) => updateStatus(ctx));
	pi.on("session_tree", (_event, ctx) => updateStatus(ctx));
	pi.on("turn_end", (_event, ctx) => updateStatus(ctx));

	pi.on("session_shutdown", (_event, ctx) => {
		unsubscribeDock?.();
		unsubscribeSnapshot?.();
		lastCtx = undefined;
		pi.events?.emit("pi-pulse:telemetry:v1", { kind: "compact", scope: "", data: null });
		if (ctx.mode === "tui") ctx.ui.setStatus(statusKey, undefined);
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const { model } = ctx;
		const { preparation, signal } = event;
		if (!model || preparation.settings.reserveTokens !== handoffReserve(model)) return;
		try {
			const skill = stripFrontmatter(await readFile(join(getAgentDir(), "skills/handoff/SKILL.md"), { encoding: "utf8", signal })).trim();
			if (!skill) throw new Error("The handoff skill is empty");
			const focus = [skill, event.customInstructions,
				"Return only the Markdown handoff. Pi saves the file. Preserve the current task, decisions, next steps, and any work in progress. Redact sensitive values and paths, including those in the previous summary.",
			].filter(Boolean).join("\n\n");
			const handoffPreparation = {
				...preparation,
				isSplitTurn: false,
				messagesToSummarize: [...preparation.messagesToSummarize, ...preparation.turnPrefixMessages],
				turnPrefixMessages: [],
				fileOps: { read: new Set<string>(), written: new Set<string>(), edited: new Set<string>() },
			};
			const result = await compact(handoffPreparation, model, undefined, undefined, focus, signal, ctx.thinkingLevel,
				(m, context, options) => ctx.modelRegistry.streamSimple(m, context, options), undefined, getSettings(ctx).getRetrySettings());
			signal.throwIfAborted();
			if (!result.summary.trim()) throw new Error("The handoff summary is empty");
			return { compaction: { ...result, details: { handoff: true } } };
		} catch (error) {
			if (!signal.aborted) warn(ctx, "Handoff unavailable; using Pi compaction without a handoff file", error);
		}
	});

	pi.on("session_compact", async (event, ctx) => {
		const entry = ctx.sessionManager.getBranch().filter((item) => item.type === "compaction").at(-1) ?? event.compactionEntry;
		const handoff = entry.details as { handoff?: boolean } | undefined;
		if (event.fromExtension && handoff?.handoff === true && ctx.sessionManager.getSessionFile()) {
			const sessionId = ctx.sessionManager.getSessionId();
			try {
				if (![sessionId, entry.id].every((id) => /^[a-z0-9_-]+$/i.test(id))) throw new Error("Invalid checkpoint ID");
				const dir = join(getAgentDir(), "compact-checkpoints", sessionId);
				await mkdir(dir, { recursive: true, mode: 0o700 });
				const markdown = `# Pi handoff\n\n${entry.timestamp} · ${event.reason} · ${entry.tokensBefore} tokens before compact\n\n${entry.summary}\n`;
				await writeFile(join(dir, `${entry.id}.md`), markdown, { flag: "wx", mode: 0o600 }).catch((error: NodeJS.ErrnoException) => {
					if (error.code !== "EEXIST") throw error;
				});
			} catch (error) {
				warn(ctx, "Handoff file not saved", error);
			}
		}
		updateStatus(ctx);
	});
}
