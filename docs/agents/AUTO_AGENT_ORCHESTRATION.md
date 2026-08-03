# FORGE AUTO AGENT ORCHESTRATION

Date: 2026-08-04
Status: proposed canonical process extension
Owner: coordinator / control plane

## 1. Purpose

Make multi-agent execution the default coordinator behavior when a Forge task is large enough to benefit from parallel ownership. The user should not need to explicitly ask for agent branches, handoff files, a NO-STOP rule, or a dependency graph every time.

This protocol extends:

- `skills/forge-enterprise-completion/SKILL.md`;
- `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md`;
- existing workstream/RC/UI agent boards.

Exact GitHub state remains authoritative.

## 2. Coordinator triage is mandatory

Before implementation, the coordinator classifies the task as either:

- `SINGLE`: one owner is the safest and fastest execution model;
- `PROGRAM`: the task should be decomposed into coordinated worker agents.

The classification is a technical decision. Do not ask the user to choose an agent count or branch topology unless a business boundary cannot be inferred from repository evidence.

## 3. PROGRAM trigger

Default to `PROGRAM` when at least one strong trigger exists and ownership can be separated cleanly:

1. two or more independent code ownership hotspots can progress in parallel;
2. the task spans multiple workstreams/domains/packages with different authorities;
3. a shared foundation/contract must be built before several independent consumers;
4. the work contains distinct source-lock/audit, implementation, integration, and QA/convergence lanes;
5. multiple substantial slices can be completed without editing the same primary files;
6. the requested outcome is a platform-wide rebuild, convergence, parity program, enterprise hardening wave, or similarly broad effort whose evidence cannot reasonably fit one worker stream;
7. there are independent FAST/STANDARD/CRITICAL substreams whose merge/deploy boundaries differ.

Do not fan out merely because the task sounds important.

## 4. Keep SINGLE when

Prefer one worker when:

- one primary hotspot owns most changes;
- the implementation is a small or medium vertical slice;
- concurrency would require workers to edit the same authoritative contract repeatedly;
- a CRITICAL invariant must be designed and proven atomically before any safe parallel work exists;
- the apparent subparts are sequential rather than independently executable;
- agent coordination overhead would exceed implementation work.

A coordinator may later promote `SINGLE -> PROGRAM` when audit reveals clean parallel boundaries.

## 5. Automatic PROGRAM bootstrap

When classified `PROGRAM`, the coordinator MUST perform the following without waiting for the user to request it:

### 5.1 Audit exact state

Read:

1. exact current `main`;
2. active branches/PRs in scope;
3. Forge Enterprise Completion Skill;
4. `CURRENT_STATUS.md`;
5. `NEXT_TASKS.md`;
6. North Star and capability map;
7. architecture/spec/source-lock relevant to the program;
8. historical substantive branches/PRs that may contain reusable evidence.

### 5.2 Create a program baseline

Create one program/control branch from exact current `main`.

The program baseline owns coordination artifacts, not arbitrary implementation hotspots.

Record exact base SHA.

### 5.3 Create common program artifacts

At minimum create or update:

- technical/program specification;
- agent board;
- common `NO_STOP_RULE.md` or equivalent embedded rule;
- dependency graph / merge order;
- source-lock or parity matrix when external benchmark/reference code is material;
- shared acceptance gates.

### 5.4 Define ownership before worker branches

For each worker define:

- mission/outcome;
- primary owned files/packages/domains;
- forbidden/shared hotspots;
- required reading;
- dependencies supplied/consumed;
- risk class;
- acceptance evidence;
- merge/deploy boundary;
- handoff format.

No two workers should have primary ownership of the same shared hotspot.

### 5.5 Create worker branches automatically

Create worker branches from the exact program baseline, not from stale historical branches.

Recommended naming:

```text
<domain>/<program>-00-control
<domain>/<program>-01-<owner>
<domain>/<program>-02-<owner>
...
```

Existing repository naming conventions may override this when a current board already owns the namespace.

### 5.6 Seed every branch

Each worker branch receives a branch-local handoff file before implementation starts.

The handoff must contain:

- branch and baseline;
- mission;
- owned scope;
- out-of-scope boundaries;
- required reading;
- implementation slices;
- validation gates;
- dependency-request format;
- NO-STOP behavior;
- completion record section;
- startup prompt.

### 5.7 Verify topology

Before implementation fan-out, compare every worker branch against the program baseline.

Expected bootstrap state:

```text
ahead: 1 or documented coordination-only commits
behind: 0
changes: only branch-local handoff/coordination artifacts
```

If a worker accidentally contains implementation from another branch, repair topology before work begins.

## 6. Default agent-count heuristic

Use the smallest number of workers that gives clean ownership.

Guideline:

- 1: single hotspot / tightly coupled slice;
- 2-4: normal cross-package feature or domain hardening;
- 5-8: platform rebuild, large convergence, or enterprise wave;
- >8: only when the capability graph genuinely has that many independent owners and coordinator overhead remains justified.

Agent count is not a success metric. Eight idle branches are not parallelism; they are gardening.

## 7. Dependency graph

Every program must explicitly record dependencies.

Example:

```text
CONTROL
  -> FOUNDATION
      -> SHELL
      -> DATA
      -> VISUAL
          -> BUILDER
              -> MOBILE_QA
  -> CONVERGENCE
```

Workers may start before all dependencies finish when they can use local semantic seams or fixtures without creating a competing canonical contract.

If a dependency blocks one subsection, record a Dependency Request and continue all independent work.

## 8. NO-STOP rule

Workers do not stop or ask the user for normal technical decisions.

They must audit repository evidence and choose the best implementation consistent with Skill/North Star/architecture.

A worker may stop and ask only when one of these is true:

1. a business/product decision materially changes authoritative behavior and cannot be inferred from repository/spec evidence;
2. a shared authoritative contract owned by another stream must change and the dependency cannot be isolated behind a seam;
3. a destructive or production operation requires explicit authorization;
4. non-UI work is ready to merge/deploy and project policy requires user approval.

Local blockers are not stop conditions.

When blocked locally:

1. write a Dependency Request;
2. document the exact blocked scope;
3. continue every independent slice;
4. leave tests/fixtures/interfaces that make later convergence deterministic.

## 9. Dependency Request

Use:

```text
Dependency Request
Owner: <target worker/workstream>
Need: <specific contract/evidence/change>
Why: <why this belongs to target owner>
Blocked scope: <exact subsection>
Can continue independently: yes/no
Next independent work: <what the worker will do now>
```

Do not silently copy another owner's logic to avoid the dependency.

## 10. Coordinator responsibilities during execution

The coordinator is an active control plane, not another random worker.

It must:

- inspect exact worker heads and diffs;
- keep the board current;
- detect overlapping edits early;
- route dependency requests;
- identify reusable work from concurrent `main` drift;
- prevent duplicate primitives/sources of truth;
- decide convergence and merge order from repository evidence;
- rebase/reseed stale workers when needed;
- preserve risk-specific merge/deploy boundaries;
- ensure shared contracts converge before consumers claim RC/Hardened;
- update canonical evidence only after merge/verification.

The coordinator should not take over worker hotspots merely because a worker has a local blocker.

## 11. Merge and deploy behavior

### UI-only

After blast-radius verification, UI-only slices may use the project fast path and can be merged/deployed without an additional user confirmation when existing project policy permits it.

### Non-UI / shared contract / backend / schema / migration / business rule

Workers may create branches, commits, tests, handoff, and PR-ready evidence autonomously.

Stop before merge/deploy until explicit user approval when required by the Forge Skill.

### Destructive production operations

Always require explicit authorization.

## 12. Convergence gate

A program is not complete merely because every worker has commits.

Coordinator must prove:

- worker ownership remained clean;
- dependency requests are resolved or explicitly deferred;
- shared contracts have one authority;
- no duplicate runtime/domain primitive was introduced;
- required targeted tests/build/typecheck/migration/browser evidence passed according to risk;
- final integrated diff is reviewed against exact current `main`;
- status/capability evidence reflects only verified maturity;
- merge/deploy behavior matches risk class.

## 13. Standard program artifacts

Recommended layout:

```text
docs/agents/<program>/
  AGENT_BOARD.md
  NO_STOP_RULE.md
  <PROGRAM_SPEC>.md
  <NN>-CONTROL.md
  <NN>-<OWNER>.md
  ...
```

Use an existing domain-specific agent directory when one already exists.

## 14. Startup prompt template

```text
Đọc branch-local handoff, Forge Enterprise Completion Skill, exact current branch/main và các source bắt buộc. Làm đúng ownership của branch. Tự audit và quyết định kỹ thuật theo repo evidence. Không dừng vì blocker cục bộ: ghi Dependency Request rồi tiếp tục mọi phần độc lập. Không sửa shared hotspot của owner khác. Verify theo risk class và cập nhật completion record. UI-only theo fast path khi đủ evidence; non-UI dừng trước merge/deploy nếu policy yêu cầu user duyệt.
```

## 15. Decision record

The coordinator should report program creation concisely:

```text
Classification: PROGRAM
Reason: <clean parallel boundaries>
Program baseline: <branch + exact SHA>
Workers: <N>
Dependency root: <foundation/control owner>
Risk mix: <FAST/STANDARD/CRITICAL>
Merge boundary: <automatic UI-only / approval-required non-UI>
```

Do not ask the user whether agents are needed when the repository evidence already makes the answer clear.
