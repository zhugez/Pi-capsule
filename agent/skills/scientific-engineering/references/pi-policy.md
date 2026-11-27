# Pi execution policy for upstream AAE

Apply this policy after loading the upstream AAE skill.

- Use the frozen plan and engine actions. Do not create a second scheduler, external loop, persistent Pi goal, or unbounded background agent.
- Bound execution by the configured objective and budgets. The upstream indefinite loop does not extend host execution or authorization.
- The engine uses two owned detached worktrees from committed HEAD. Source-checkout changes remain outside the experiment. Worktrees share Git metadata and are not a security sandbox.
- All committed files outside scope are protected, in addition to protectedFiles. Include evaluator scripts, golden outputs, datasets and local evaluator dependencies. Specify external dependencies and tool versions in constraints. Treat benchmark and evaluator code as trusted.
- Evaluator edits invalidate measurements. Do not alter tests, assertions, input distributions, thresholds, seeds, benchmark procedure, or their dependencies to obtain a better score. Start a new run when evaluation criteria legitimately change.
- Correctness comes before benchmarking. Invalid metrics, incomplete samples, command failures or cancellation cannot produce acceptance. Recovery preserves their patch and logs.
- Use independent pairs and the fixed repetition count. The engine alternates the first arm. It does not parallelize benchmarks. Pre-register warmups and environment overrides. Keep machine load stable.
- Acceptance requires both the minimum geometric aggregate improvement and a one-sided exact paired sign test against that threshold. Confidence refers to the median paired gain, not a geometric-mean confidence interval. The engine divides alpha by maxExperiments. No optional stopping or sample expansion within an experiment is allowed. Treat tied gains as failures to exceed the threshold.
- Each accepted change has a numbered patch and an anchored Git tree checkpoint. Automatic commits require commitAccepted: true plus explicit /scientific on-commits authorization when creating the run. The CLI requires --allow-commits on start. Otherwise retain the patches for review. Never commit this integration or unrelated files merely because an experiment can commit.
- Normal commit hooks and signing remain enabled. A hook that changes the measured patch blocks acceptance. Resolve the hook failure or recover. Do not disable validation to force a commit.
- Runtime limits bound engine commands and routed analysis. Token budgets admit work using completed host-message usage and scientific_reason usage. A current response can exceed the remaining budget. Provider calls outside these paths are not automatically charged. Avoid separate agent/model subprocesses during a budgeted run. A CLI operator must supply measured usage through the usage action for external reasoning.
- Missing usage blocks further experimental work. Reflection, status, recovery and finish remain available. Do not invent token usage or reset a budget to continue.
- Rejected and inconclusive patches return to the last acknowledged best tree. Recovery preserves evidence before restoration. Never stash, reset, clean, switch or force-remove the source checkout.
- Do not edit another run's worktrees or state. Keep logs local. Publishing findings or contributing to upstream requires separate authorization. Knowledge-base contributions default to false.
- Optional adapter commands are explicit argv arrays. Missing or failed verification blocks correctness. Failed memory delivery leaves the local findings intact and records an error. Telemetry uses a Capsule event; it does not claim an unsupported Pulse dock integration.
