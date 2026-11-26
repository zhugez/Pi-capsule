# Scientific Engineering Mode

Scientific Engineering Mode adds optional execution controls for upstream Agentic Algorithm Engineering (AAE). It applies to optimization, algorithm engineering, performance tuning, measurable quality improvement, and experiments. Ordinary Pi tasks keep their existing workflow.

The authoritative methodology is [CHSZLab/AgenticAlgorithmEngineering](https://github.com/CHSZLab/AgenticAlgorithmEngineering). Capsule pins an audited revision and loads its skill, knowledge base and report generator only when needed. It does not copy those resources into this repository.

## Architecture

agent/extensions/scientific-engineering/index.ts owns the optional Pi commands, tools, session journal pointer, model-role calls and usage events. engine.ts owns the frozen contract, worktrees, correctness gates, subprocess lifecycle, statistics, checkpoints and result projections. scripts/scientific-engineering.mjs calls the same engine outside Pi. The skill directs the experiment loop through these actions. There is no second agent runtime.

State flows from created to baselined, then ready, proposed, evaluating and review. Reflection returns it to ready. Interrupted commands require recovery. Explicit finish ends the run. Status and recovery do not consume an experiment slot. Completed rejected and inconclusive candidates do.

Upstream resources remain in a separately pinned checkout. Local evaluators determine correctness and metrics. Pi model pools supply optional analysis through the native registry. Adapter boundaries use argv/stdin or the shared event bus.

## Install and activate

The extension and skill ship through Capsule's existing Pi package. With this local checkout installed, use /reload after reviewing the changes. Do not run pi update against an uncommitted package checkout: package reconciliation can discard local edits.

Install the optional upstream resources once from the Capsule repository:

    node scripts/scientific-engineering.mjs install-upstream

This creates <Pi agent directory>/aae-upstream at the pinned revision. It refuses to overwrite a different or dirty checkout. Set PI_AAE_UPSTREAM to use another location. Install does not enable the mode or change model settings.

In Pi:

    /scientific on
    /skill:scientific-engineering optimize the membership filter using a fixed correctness and latency benchmark

Use /scientific off for unrelated work. An existing run and its artifacts remain available. To resume explicitly from the target repository root:

    /scientific resume <run-id>

Mode selection never creates or focuses a Pi goal. If goal work is desired, the user selects the goal through the existing goal commands.

Runtime uses Pi-provided APIs and Node built-ins. typebox is a development dependency for typechecking host-provided tool schemas, not a new runtime service. The standalone CLI and example require Node with native TypeScript stripping (tested with Node 24.18.0. Pi requires Node 22.19 or later).

## Plan and lifecycle

Use examples/scientific-engineering/plan.json as a starting point. The plan schema is schemas/scientific-plan.schema.json. Commands are argv arrays, not shell strings. Commands execute from the corresponding owned checkout. Exact relative scope files are writable. Directories and symlinked scope or evaluator paths are not supported.

A plan defines objective, task kind, constraints, metric, scope, protected evaluator files, correctness commands, benchmark command and profile command. constraints describes the invariants. The correctness commands must actually enforce them. The engine cannot prove that an arbitrary test suite captures every semantic requirement.

scientific_engineering exposes the lifecycle:

| Action | Required state | Result |
| --- | --- | --- |
| start | Mode on, trusted project, plan file | Frozen plan, committed baseline and two owned worktrees |
| baseline | created | Correctness checks and unchanged baseline samples |
| profile | baselined or ready | Local profiler output saved in logs/profile.log |
| propose | ready | Falsifiable hypothesis, expected fractional gain, prediction and evidence recorded before edits |
| evaluate | proposed | Fixed correctness checks, paired benchmarks and keep/discard/inconclusive verdict |
| reflect | review | Observation and next hypothesis persisted |
| report | Existing run, runtime remaining | Upstream report sources and an optional PDF |
| recover | No live operation owner | Patch preserved, last acknowledged checkpoint restored |
| finish | No pending or unreflected experiment | Durable final artifacts |
| status | Any available run | Compact state summary |

After propose, edit only plan.scope under the returned candidate path. Call evaluate without supplying fabricated measurements. It runs correctness itself and collects benchmark outputs. The final nonempty stdout line of each benchmark invocation must contain a positive finite primary metric:

    {"metric": 12.34}

Use the same metric units throughout a run. For throughput or quality, choose direction higher. For latency, memory or error, choose lower. Zero and negative metrics need a predeclared positive transformation. If a benchmark aggregates multiple inputs, use a fixed documented aggregation and retain the per-input evidence in its log.

After evaluate, inspect the recorded measurements and call reflect with the interpretation. A proposed implementation cannot proceed directly to a second hypothesis without that reflection. Repeat until the objective or a limit stops admission. The skill directs this loop. The extension adds no background scheduler.

## Baseline, evaluator integrity and Git

A run starts from committed HEAD, including when the source checkout is dirty. It records that policy and leaves staged, unstaged and untracked source changes intact. It does not copy dirty source files into the experiment. If those changes belong in the baseline, commit them only with authorization before starting a new run.

The engine creates control and candidate worktrees under <Pi agent directory>/scientific-runs/<run-id>. The source branch and index remain untouched. All committed files outside scope are protected. protectedFiles additionally identifies the evaluator dependency set explicitly. Each must exist in the committed baseline. Hashes cover file names, executable bits and contents. Integrity checks surround correctness, profiling and each benchmark invocation. A recorded Git tree also detects changes to the candidate during evaluation, including index-only changes.

These are integrity controls for trusted code, not an adversarial sandbox. Commands run under the same OS user and can access shared Git metadata and host resources. List evaluator dependencies completely. Pin external tools, dependencies, data and machine conditions through the plan and environment. Use OS isolation outside this extension for hostile code. Hashing cannot detect a malicious program that tampers with an uncovered dependency or changes and restores a file between checks.

Every accepted result saves a numbered binary-capable patch and a Git tree checkpoint. A private refs/pi-capsule/scientific/<run-id> ref retains the best tree. With the default commitAccepted false, no experiment commit is created. With commitAccepted true and explicit `/scientific on-commits` authorization at run creation, the engine commits accepted scope changes on the detached experiment checkout. Hooks and signing remain active. Source branches do not move. Rejected or inconclusive candidates are restored to the best acknowledged tree, and their patch and logs remain available.

Review patches before applying them to your working branch. Applying or cherry-picking patches to the source checkout is a separate user-controlled operation. For patch-only runs, apply patches/0001.patch onward in order. Commit-enabled runs also record commit ids for review or cherry-pick.

## Measurement and acceptance

A baseline passes correctness before any optimization. A profile must exist before the first hypothesis. For each candidate, correctness runs before benchmark warmups. A configured verification adapter runs as another correctness command.

Each experiment compares the candidate against the latest accepted control, not just the original baseline. It collects the fixed number of fresh pairs and alternates control-first and candidate-first ordering. Warmups are fixed at setup. Execution is serial to avoid benchmark contention.

For a lower-is-better metric, paired gain is 1 - candidate/control. For a higher-is-better metric, gain is candidate/control - 1. A pair is a success only when its gain strictly exceeds minImprovement. Ties count as failures. Acceptance requires a one-sided exact binomial sign-test p-value at or below (1-confidence)/maxExperiments, plus a geometric aggregate gain at least minImprovement. This adjusts the acceptance tests across the bounded search with a Bonferroni allocation.

Confidence concerns the median paired gain under independent, stationary pairs. It is not a confidence interval for the geometric mean. The geometric criterion is an additional effect-size check. Adaptive candidate selection does not justify changing repetitions or thresholds mid-run. Repeated benchmark pairs still need comparable hardware, workload and machine load.

A confident failure to exceed the minimum produces discard. Otherwise uncertain evidence produces inconclusive. Failed correctness produces discard. Invalid metrics, benchmark failure, timeout or cancellation cannot produce keep. Integrity failure blocks the run for explicit recovery and invalidates the affected evaluation. No partial sample set is used to accept a patch.

## Configuration and budgets

Optional global overrides live at <Pi agent directory>/scientific-engineering.json. A plan's config overrides those settings. Configuration freezes when the run starts. The JSON Schema is schemas/scientific-engineering.schema.json. Unknown properties and invalid ranges fail before a run starts.

| Setting | Default | Meaning |
| --- | --- | --- |
| maxExperiments | 10 | Maximum candidate evaluations, excluding the baseline |
| tokenBudget | 200000 | Completed usage admitted before subsequent experiment work |
| runtimeMs | 1800000 | Elapsed run lifetime, including interruption time |
| commandTimeoutMs | 60000 | Per-command and routed-reasoning deadline |
| minImprovement | 0.02 | Fractional minimum gain |
| repetitions | 9 | Complete paired samples per candidate |
| warmups | 1 | Warmups per arm before measured candidate pairs |
| confidence | 0.95 | One-sided acceptance confidence before search adjustment |
| diminishingReturns | 3 | Consecutive non-kept results before stopping |
| commitAccepted | false | Request experiment commits, which also require explicit command authorization |
| negativeMemory | true | Return prior rejected/inconclusive findings from the same repository |
| upstreamRevision | Audited upstream commit | Resource revision that setup requires |

The engine rejects a repetition count whose smallest attainable p-value cannot satisfy the configured experiment/confidence combination. A metric target stops further experiments when the current accepted metric reaches it. Changing constraints, thresholds, samples or limits requires a new run.

A safe environment allowlist is frozen at setup, together with plan.environment overrides. It includes PATH, home/temp/locale settings, common compiler flags and numerical thread controls. Provider keys are not inherited into benchmark commands by default. Explicitly supply other required variables in the plan. Plan values and artifacts are private but can contain sensitive project data. Do not commit them by default.

Engine subprocesses use argument arrays, bounded logs and process-group termination. stdout is limited to 1 MiB and a command log to 16 MiB. POSIX cancellation kills the command's process group. Windows uses taskkill /T /F on timeout. That path needs Windows validation. A Linux recovery can identify and stop a recorded orphan using its process start identity. If identity cannot be established or only unverifiable descendants remain, recovery stops for manual process termination.

Tokens are accounted from completed host assistant messages and scientific_reason calls. Duplicate usage keys do not charge twice. Missing usage blocks new experiment work. The token budget is an admission cap: an already executing response can exceed it. It is not a provider prepaid limit. Separate subagents, Advisor calls and model subprocesses are not automatically charged by this extension. Keep analysis within the host and scientific_reason paths, or account measured external usage through the CLI usage action. CLI-only deterministic runs have no model usage unless the operator introduces external reasoning.

## Model routing and optional adapters

scientific_reason accepts architecture, routine or review. Default preferences are GPT-6.2 Sol, DeepSeek V4.1 Flash and GPT-6.2 Astra. Override models with catalog names or exact provider/model references. The tool checks the live available catalog and session model scope. Missing or ambiguous model matches produce a clear error. Choose an exact provider/model reference when multiple providers expose the same preferred name. Credential or provider errors are surfaced and unknown usage stops further experimental admission. No provider id is embedded in the default preferences.

The primary model, Advisor settings, model pools and goal model settings remain unchanged. Role calls use the same native registry streaming interface that Pulse uses. Verification and benchmark decisions are deterministic local operations.

All adapters default off or empty:

- adapters.verification: an argv array for an installed behavioral verifier. Configure a verified Invar command or wrapper here when available. The wrapper runs in both baseline and candidate correctness phases. A nonzero exit fails correctness. No unavailable Invar interface is assumed.
- adapters.memory: an argv array that receives one JSON finding on stdin after reflection. For the existing ExoMind CLI, use node and the absolute path to scripts/scientific-exom-memory.mjs. It mirrors the existing capture --input and notes-root contract. A failed adapter records a delivery error and retains the local finding.
- adapters.telemetry: enables pi-capsule:scientific:v1 on Pi's shared event bus. Payloads include version, sessionId and the compact run summary. Consumers can subscribe without changing the experiment engine. Pulse's current compact/fast dock does not consume experiment events. findings.jsonl is the durable telemetry source.

Do not configure adapter wrappers that invoke unaccounted models or publish private findings without authorization.

## Persistence and recovery

Each run retains:

- state.json: authoritative versioned state, budgets, baseline/best identity, hypothesis, results and pending acceptance.
- plan.json: frozen setup, commands, environment and machine metadata.
- operation.lock and transient child.json: operation ownership and subprocess recovery information.
- findings.jsonl and results.tsv: regenerated result projections, including negative experiments.
- logs/: bounded command output.
- patches/: numbered accepted patches.
- report/session.json and report/experiments/NNN/: upstream-compatible data, predicted hypothesis, change.patch, raw samples and verdict.
- recovery/: preserved interrupted or invalid candidates.

Files use private permissions where supported. State writes use a temporary file, fsync and rename. Git operations and filesystem writes are not a single transaction. The engine publishes the best checkpoint only after preparing its patch, tree and optional commit. Recovery returns to the last acknowledged state and never repeats an unacknowledged commit automatically. Unacknowledged objects can remain in Git for inspection.

Only one operation owns a run at a time. A live owner prevents recovery. An abandoned lock requires explicit recover, which checks process ownership before restoring anything. New sessions do not automatically select a run. Session journal entries can restore the same session's enable flag and run id. They do not execute commands on startup.

Finished worktrees and checkpoint refs are retained deliberately. Inspect or export evidence before removing them. Use normal git worktree remove only after their contents are preserved. Do not use --force or git clean against user work. Remove the corresponding private ref only after the checkpoint is no longer needed.

## CLI and example

The standalone CLI exercises the same engine:

    node scripts/scientific-engineering.mjs start /absolute/path/plan.json
    node scripts/scientific-engineering.mjs baseline <run-id>
    node scripts/scientific-engineering.mjs profile <run-id>
    node scripts/scientific-engineering.mjs propose <run-id> hypothesis.json
    # Edit only returned candidate scope files.
    node scripts/scientific-engineering.mjs evaluate <run-id>
    node scripts/scientific-engineering.mjs reflect <run-id> reflection.json
    node scripts/scientific-engineering.mjs report <run-id>
    node scripts/scientific-engineering.mjs finish <run-id>

For a commit-enabled CLI run, add --allow-commits to the start command. Configuration alone cannot authorize a commit. In Pi, use /scientific on-commits before creating a commit-enabled run.

The hypothesis JSON contains hypothesis, prediction, expectedImprovement and evidence. The reflection JSON contains reflection. usage accepts a unique key and a measured tokens value. Status is read-only. Set PI_CODING_AGENT_DIR or PI_AGENT_DIR to isolate CLI state.

Run the complete membership-filter example after installing upstream:

    pnpm scientific:example

It creates a disposable repository and checks a committed baseline. Node's CPU profiler supplies evidence. The candidate uses a Set for membership. Unchanged correctness and latency benchmarks determine the verdict. The example records the result and invokes upstream report generation. It preserves the original target. Its output gives the experiment and example-repository paths. It does not use paid models. The example's result is machine-specific evidence, not a general speedup promise.

Python generates the upstream report sources. If latexmk is absent, the generator reports that fact and retains the sources. No PDF is claimed. If PDF compilation fails, inspect the saved report log. Capsule does not maintain a second report generator.

## Validation

    pnpm check
    pnpm test:scientific

The scientific tests use disposable Git repositories, synthetic deterministic metrics, fixed correctness checks and the real Pi extension loader. They cover opt-in behavior, lifecycle ordering, acceptance and rollback, source preservation, evaluator and candidate tampering, interrupted commits, locks, accounting and routing. The runnable example exercises real timing, profiling and the actual upstream report generator.

The [ecosystem audit](scientific-engineering-audit.md) records the verified existing interfaces and the integration decisions.
