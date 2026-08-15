# Sentrux Parallel Convergence Protocol

## Goal

Raise the Sentrux quality score through real architectural improvements while allowing multiple agents to work in parallel without overlapping ownership or gaming the metric.

Current convergence baseline: use the score measured from the branch at the start of the agent session. The branches were originally split from PR #879 HEAD (`0843e37`), whose latest observed baseline was approximately `5906`. Always re-measure; do not assume that number remains current.

## Non-negotiable rules

1. Stay inside the branch ownership defined below. Do not make opportunistic edits in another agent's area.
2. Run a Sentrux baseline before making a candidate change and record the relevant structural diagnostics.
3. Prefer the smallest coherent architectural change that can improve the graph.
4. Measure every candidate independently: `before -> after`.
5. Keep a candidate only when the Sentrux result improves without introducing architectural regressions.
6. Relevant typecheck/tests must pass before a candidate is considered valid.
7. Do not increase dependency cycles, unresolved imports, god files, or other material structural debt merely to gain aggregate score.
8. Never game Sentrux by excluding, deleting, renaming, moving, generating, or hiding legitimate first-party source solely to improve the score. Boundary/exclusion changes are valid only when the excluded material is genuinely generated, vendored, reproducible upstream, or otherwise not first-party source.
9. Failed or zero-gain experiments must be reverted completely. Do not leave experimental residue in the branch.
10. Keep commits small and attributable. Prefer one validated architectural gain per commit.
11. Do not merge another parallel branch into this branch while experimenting. Integration happens after branch results are compared.
12. If a useful change requires crossing ownership boundaries, stop and document the proposed cross-scope change rather than editing the other area.

## Branch ownership

### `agent/sentrux-parallel-server-core`

Owns server/core architecture work: server-side dependency cycles, core registries, server god files, server dependency depth, server module boundaries and closely related server structural hotspots.

Avoid client/views, Alumdoor-specific implementation work, and general generated/vendor cleanup unless a tiny change is strictly required to validate a server candidate.

### `agent/sentrux-parallel-client-views`

Owns client/views architecture: views packages, client dependency depth, barrel imports, providers/contexts, client project references and runtime leaf imports.

Avoid server/core registries, Alumdoor-specific implementation work, and repository-wide artifact/vendor policy.

### `agent/sentrux-parallel-alumdoor`

Owns Alumdoor first-party structural work: complexity hotspots, oversized modules/functions, internal dependency structure, transaction/worker/domain decomposition and Alumdoor-specific cycles.

Avoid unrelated server/core, generic views architecture, and repository-wide boundary cleanup.

### `agent/sentrux-parallel-boundaries`

Owns repository/package boundaries: generated artifacts, vendored/reproducible upstream material, package/source boundaries, tracked build outputs, graph noise and architecture-boundary enforcement.

This branch must be especially conservative: never hide real first-party code to gain score. Do not refactor business implementation owned by the other three branches.

## Candidate loop

For each idea:

1. Measure and save the current Sentrux result.
2. Identify one structural offender or hypothesis from Sentrux diagnostics/graph evidence.
3. Make the minimum coherent change.
4. Run the relevant typecheck/tests.
5. Re-run Sentrux using the same measurement conditions as the baseline.
6. Compare score and structural diagnostics.
7. If positive and safe, commit it. If zero/negative or structurally worse, revert it completely.
8. Continue from the new validated baseline.

Do not stack several unmeasured experiments and then attribute the combined delta to all of them.

## Validation gate

A candidate is merge-worthy only when all applicable conditions hold:

- Sentrux Quality increases, or a specifically targeted severe structural metric improves with a clearly documented reason for accepting a neutral aggregate score.
- No new dependency cycle is introduced.
- No material increase in unresolved imports/dependencies is introduced.
- God-file/complexity/depth metrics do not materially regress without explicit justification.
- Relevant typecheck passes.
- Relevant tests pass.
- Legitimate first-party source remains visible to the architecture graph.
- The diff remains within branch ownership.

A score increase alone is not sufficient.

## Commit convention

Prefer commit messages that identify the architectural change. In the commit body or branch handoff, record the measured result, for example:

```text
Sentrux: 5906 -> 5942 (+36)
Cycles: 0 new
Typecheck: PASS
Tests: PASS
```

Use actual measured values; never copy the example numbers blindly.

## Agent handoff report

Before stopping work on a branch, leave a concise report containing:

```text
Branch:
Starting Sentrux Quality:
Final Sentrux Quality:
Net delta:
Validated commits:
Cycles before/after:
God files before/after:
Unresolved imports before/after:
Typecheck/tests:
Main files/modules changed:
Rejected experiments:
Cross-scope opportunities for other agents:
```

## Integration rule

Do not assume branch deltas are additive. Two independent changes can interact in the combined graph. After parallel work finishes, integrate validated commits incrementally into the convergence branch and re-run Sentrux after each integration. Keep only combinations that preserve the architectural gains and validation gates.

## Definition of done

The objective is not merely to reach a numeric target. The branch is successful when it produces validated, test-passing, first-party architectural improvements with a reproducible Sentrux gain and a clean handoff that can be integrated safely into the main convergence effort.
