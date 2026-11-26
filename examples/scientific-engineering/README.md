# Example optimization session

From the Capsule repository, install the optional upstream resources and run:

    node scripts/scientific-engineering.mjs install-upstream
    node scripts/scientific-example.mjs

The example creates a temporary Git repository containing these files. It measures an unchanged membership filter, profiles it, records a hypothesis, changes only target.mjs, and reruns the frozen correctness and benchmark commands. It then saves the result, reflection, accepted patch when justified, and upstream report sources. Output includes all artifact paths.

The baseline uses repeated Array.includes calls. The candidate constructs a Set once per filter call. The fixed evaluator checks ordering, duplicate handling, NaN, signed zero and seeded inputs. The latency benchmark always uses the same inputs and verifies its checksum.

The example performs one candidate evaluation and stops. It uses deterministic local tools and no model calls. commitAccepted is false. Its baseline commit belongs only to the disposable example repository. The source Capsule checkout and its existing uncommitted changes are preserved.

For an interactive session, copy the evaluator and plan into a project, establish an authorized committed baseline, enable /scientific on, and invoke /skill:scientific-engineering. Follow the [operating guide](../../docs/scientific-engineering.md). Never change the evaluator to obtain acceptance.
