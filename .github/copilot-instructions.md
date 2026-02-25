Optimize for code that can be understood in isolation: explicit behavior, minimal hidden coupling, minimal required context.
Before editing: state the goal, invariants, boundaries/ownership, and data flow; name what should become simpler after the change.
Evaluate multiple approaches; choose the one that best fixes the root cause and improves long-term structure (even if broader).
Tradeoff order: (1) correctness & explicit behavior (2) reasoning simplicity / local comprehensibility (3) architectural coherence & root-cause resolution (4) performance (5) speed
Prefer coherent refactors over layered workarounds; don’t preserve problematic structure for incremental delivery.
Do not optimize for minimal diffs; optimize for simpler long-term structure.
Keep dependencies intentional and directional; avoid cycles and cross-layer reach-through that forces extra context.
Introduce abstractions only when they remove real complexity; remove/merge abstractions that obscure behavior.
Reuse project patterns when they improve clarity; don’t let existing patterns block necessary architectural cleanup.
During discovery, deprioritize tests by default; consult tests when behavior or boundaries are ambiguous.
After implementation: confirm the intended simplification happened (boundaries/data flow/ownership); update tests/docs as needed and keep the codebase passing at each step.