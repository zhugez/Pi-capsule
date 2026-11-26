# Pi ecosystem audit

Inspected locally on 2026-11-27. This audit concerns the installed configuration and source, not model marketing claims.

## Sources and instruction hierarchy

- Capsule is a Pi package. Its package.json discovers agent/extensions, agent/skills, and agent/prompts. Configuration export/restore and scripts/sync-config.mjs form the portable setup layer.
- Pi 1.6.1 is the running installation. The local development dependency was 1.6.0 at the initial baseline and resolved to 1.6.1 during dependency installation. Both use the same inspected extension interfaces.
- Pi's core/resource-loader.js, loadProjectContextFiles(), loads the global agent instruction file first, then ancestor instruction files from root toward cwd. loadContextFileFromDir() chooses the first available AGENTS.override.md, AGENTS.md, AGENTS.MD, CLAUDE.md, or CLAUDE.MD in each directory.
- SYSTEM.md and APPEND_SYSTEM.md have separate global/project resolution. User and system instructions still constrain repository instructions and skills.
- The active global AGENTS.md requires browser automation through agent-browser, minimal reversible changes, explicit commit authorization, preservation of uncommitted work, and honest verification. Capsule's portable agent/AGENTS.md contains the same major safety rules, with a different subagent preference. Neither is silently synchronized by this integration.
- Existing uncommitted changes in agent/extensions/compact-checkpoints.ts and scripts/compact-status.test.mjs predated this task. The integration does not edit those files.

## Existing playbooks, extensions and skills

Capsule has native extension entry points for compact checkpoints, RTK command rewriting, secret scanning, update checks, provider rules, warmup and DejaVu. agent/prompts contains the opsx-* proposal, exploration, apply, sync, update and archive templates.

Skills provide the main task playbooks. Installed examples include lean-build, surgical-patch, investigate-first, safe-refactor, `verify-and-stop`, no-mistakes, graphify, and domain-specific guidance. Scientific work therefore fits a progressively loaded skill plus an optional native extension. No replacement general-purpose scheduler is needed.

The installed settings use Codemode-only tool presentation. The integration registers ordinary Pi tools, so native tool discovery can expose them through Codemode without a separate MCP server. The existing package list includes Capsule, Pulse, pi-subagents, pi-fff, pi-btw and piolium. Resource exclusions are local preferences and remain untouched.

## Goal and execution lifecycle

Pulse extensions/goal/goal.ts constructs createGoalCore() from goal-state.ts and registers goal commands, tools, event handlers, and context filtering. Goal records, a ledger, task derivation and dependencies, completion auditing, accounting and recovery already exist. Storage defaults to .pi/goals and can use a configured absolute goalsRoot through storage/goal-root.ts.

GoalAccounting in goal-accounting.ts charges completed-turn tokens and elapsed active time. goal-compaction.ts builds compact summaries from goal records and ledger events. goal-recovery.ts diagnoses malformed files, stale locks and ledger problems. Its repair path preserves backups and requires confirmation.

Goal focus is human-owned. This session reported an unfocused open goal. No goal tool, goal creation, focus change, or goal repair was performed. Scientific run selection is a separate explicit /scientific resume operation.

## Advisor and model routing

The installed advisor.json selected xingchiapi/gpt-6.1-sol with high effort. The installed goal-settings.json selected the same model family with medium effort. The primary settings also selected xingchiapi/gpt-6.1-sol. These settings differ from some portable defaults and must not be overwritten.

Verified interfaces in Pulse:

- advisor/src/model-stream.ts resolves a configured reference with ctx.modelRegistry.find(), prefers ctx.modelRegistry.streamSimple(), and resolves provider authentication through the registry.
- advisor/src/commands/model-options.ts uses getAvailable() to populate choices.
- advisor/src/commands/lifecycle.ts can persist explicit model selection into the configured Executor. Calling pi.setModel() for temporary AAE phases could therefore affect Advisor configuration.
- advisor/src/child-session.ts distinguishes the current session model from the configured Executor and observes PI_SUBAGENT_CHILD.
- advisor/src/tools/register-lifecycle.ts owns invocation guidance, call reservations and oversight gates.

The integration uses registry.streamSimple() for optional role-specific advice. It does not call pi.setModel(), write advisor.json, or change the primary model. It respects ctx.scopedModels when configured.

The installed catalog contained these requested families at audit time:

| Catalog reference | Catalog name |
| --- | --- |
| codex-pool/gpt-6.2-sol | GPT-6.2 Sol |
| codex-pool/gpt-6.2-astra | GPT-6.2 Astra |
| hms/deepseek-v4.1-flash-free | HMS · DeepSeek V4.1 Flash Free |
| numes-pool/deepseek/deepseek-v4.1-flash:free | numes · DeepSeek V4.1 Flash (free) |

Catalog membership is not proof of usable credentials or successful inference. Capsule's portable models.json did not contain these entries. New defaults use names, with live availability validation and no silent fallback. No provider-specific reference is added to portable model settings.

## Memory, context and telemetry

Pulse extensions/exomind/index.ts registers exom_recall and exom_capture. It uses the installed exom CLI: pi-context --query for recall, and capture --input for findings. EXOMIND_NOTES_ROOT overrides its default Yasna-Memory location. The CLI was available during this audit. AAE memory delivery remains optional.

Compact checkpoints already persist Markdown summaries and cooperate with the Pulse session dock. The existing implementation and user changes remain intact. Scientific state is independent of transcript compaction: only an enable flag and run id enter the session journal. A short run summary is supplied only while the mode is active. Logs and upstream knowledge-base entries load on demand.

Pulse subscription-usage.ts implements pi-pulse:telemetry:v1, pi-pulse:telemetry-dock:v1 and pi-pulse:telemetry-request:v1. Its inspected receiver accepts compact and fast telemetry kinds. It does not expose an experiment telemetry kind. Capsule therefore publishes its own optional pi-capsule:scientific:v1 event and retains JSONL records. It does not pretend to populate an unsupported Pulse experiment dock.

Host assistant usage and explicit scientific_reason usage are charged to the scientific run. Existing Pulse goal accounting is not imported or rewritten. Scientific CLI processes do not observe unrelated model usage. Budgets have documented admission semantics.

## Checkpoints and rollback

The existing config sync uses backups, safe merges and atomic writes. Existing compact checkpoints concern conversational recovery. Goal recovery concerns goal storage. Neither is a patch checkpoint API for an experimental implementation.

Scientific mode uses Git's existing worktree, tree-object, diff, restore and optional commit operations. It adds no worktree manager dependency. It preserves the source checkout and its index. New refs are confined to refs/pi-capsule/scientific/<run-id>. Owned control and candidate checkouts isolate experimental file changes while sharing repository metadata.

No Invar binary or configured interface was found in the inspected installed configuration. The optional verification adapter accepts an explicit command. No Invar API is invented. Native tests remain sufficient when it is absent.

## Baseline and upstream

Before implementation, the existing 29 Node tests passed and TypeScript checking passed. The complete Node baseline required more than the initial short command timeout. It completed without changing tests.

The authoritative AAE checkout was inspected at commit 70b047997040d2f3a1dac1a10c391ac853593444. Relevant resources are skills/aae/SKILL.md, its bundled knowledge-base, and skills/aae/templates/report. The integration installs and checks this upstream revision instead of vendoring the methodology, knowledge base or report generator.

AAE's scientific cycle remains authoritative. Host-specific differences are explicit: finite budgets, two owned worktrees, statistical acceptance, a separate inconclusive verdict, explicit commit opt-in, and human-owned goal focus. The upstream unbounded-loop and Git-reset examples do not override these controls.
