---
name: scientific-engineering
description: Use for opted-in optimization, algorithm engineering, performance tuning, measurable quality improvements, or controlled experiments. Integrates upstream Agentic Algorithm Engineering with Pi budgets, isolated patches, immutable evaluators, and recovery. Not for ordinary bug fixes, refactors, or feature work without a measurable experimental objective.
---

# Scientific Engineering Mode

Use the upstream AAE methodology. Pi supplies execution controls, not another autonomous agent scheduler.

## Start

1. Establish that the task has a measurable experimental objective. The operator enables the optional mode with /scientific on.
2. Read the upstream skill at the installed AAE checkout: skills/aae/SKILL.md. Its default checkout is <Pi agent directory>/aae-upstream. PI_AAE_UPSTREAM can select another checkout. If resources are missing, use the installation instructions in [the operating guide](../../../docs/scientific-engineering.md).
3. Read [the Pi policy](references/pi-policy.md) after the upstream skill. User instructions and these host controls bound upstream execution.
4. Inspect the target, its instruction hierarchy, evaluators, datasets, and existing verification tools. Reuse them. Define the objective, constraints, metric direction, exact target files, fixed correctness commands, benchmark command, profile command, and budgets in a plan JSON file. Use [the plan schema](../../../schemas/scientific-plan.schema.json). Resolve unsupplied correctness decisions before running experiments.
5. Call scientific_engineering with action start and planPath. Read its committed-HEAD baseline policy and candidate path. Uncommitted changes in the source checkout are preserved and excluded. Include needed changes in a separately authorized commit before starting, or choose a different committed baseline. The run freezes its plan and configuration.
6. Read the returned negative findings. Load only relevant entries from the upstream knowledge-base/INDEX.md and its referenced files.

## Execute

Use scientific_engineering actions in this order:

1. baseline: check the unchanged implementation and record reproducible baseline measurements.
2. profile: profile the unchanged control implementation. Read the saved profile log.
3. propose: record a falsifiable hypothesis, expectedImprovement as a positive fraction, a prediction, and profiling evidence. Do this before editing.
4. Edit only the listed scope files in the returned candidate worktree. Change one cause per hypothesis. Keep the evaluator and all other inputs fixed.
5. evaluate: execute fixed correctness checks, then paired control/candidate benchmarks. The engine produces keep, discard, or inconclusive. Read the samples, logs, saved patch, and decision.
6. reflect: persist what the observed result supports, what it refutes, and the next hypothesis. Negative findings matter. Distinguish evidence from guesses.
7. Repeat propose through reflect until the objective, budget, or diminishing-return limit stops the run. Reprofile with profile when the bottleneck changes.
8. report: run the upstream report generator when Python is available. Keep generated sources when LaTeX is unavailable. Inspect generated output before sharing a PDF.
9. finish: preserve the checkpoint, patches, findings and report. Present the measured result and the remaining uncertainty.

Use scientific_reason only when model analysis helps. Architecture and difficult reasoning prefer the available Sol model. Routine implementation advice and log analysis prefer DeepSeek. Critical review prefers Astra when justified. The tool checks each preference against Pi's available, scoped catalog. It neither changes the primary model nor edits Advisor settings. Local correctness and benchmark tools determine acceptance.

## Resume

Use /scientific resume <run-id> from the target repository root. Read state.json, findings.jsonl and the last logs. Call recover for an interrupted operation before another hypothesis. Recovery saves evidence and restores the last acknowledged checkpoint. It never infers acceptance from a stray commit.

Mode activation and experiment recovery never create, focus, resume or complete a Pi goal. Goal focus remains human-owned.
