---
name: bug-fix-poteto
description: >-
  Evidence-driven bug fix playbook ported from poteto-mode (cursor/plugins pstack). Use when fixing a reported defect end to end: reproduce, root-cause, fix, verify.
---

# Bug fix

Every shipped line traces to runtime evidence. A change that "might help" is a hypothesis, not a fix, and does not ship. When evidence refutes a hypothesis, revert what it motivated.

1. **Reproduce before editing.** Run the failing path yourself and see the user's exact symptom. If it does not fire locally, recreate the user's conditions (timezone, locale, input, concurrency, env) until it does. Do not edit source until you have seen it red.
2. **Find the mechanism.** List hypotheses, then eliminate them with runtime evidence, cutting the largest remaining space each pass. Add temporary logging when state is unclear. The file the report names is where the symptom shows, not necessarily the cause.
3. **Fix at the root.** Grep every caller of the code you change. Fix where all callers route through, then check each sibling caller still behaves.
4. **Lock it with a test.** Add a test that encodes the user's symptom and its edge cases, and that failed on the old code. Prove red by running it before your edit. Never use `git stash`, `reset`, or `checkout` on the user's working tree to show red.
5. **Verify on the same surface and conditions** as step 1. The original repro now passes. "Inconclusive" or a different surface is not a pass; say so.
6. **Clean up.** Remove temporary logging and changes from refuted hypotheses. Do not commit unless the user asked. If asked, commit the test, then the fix, with nothing left uncommitted.

**Reply:** what was broken, root cause, fix, how you verified. Paste the failing-then-passing output verbatim.
