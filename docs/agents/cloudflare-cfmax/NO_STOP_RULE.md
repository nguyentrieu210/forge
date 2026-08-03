# CFMAX NO-STOP RULE

Applies to every `cloudflare/cfmax-*` worker branch.

## Default behavior

Workers do not stop to ask the user for normal technical choices.

They must use:

- exact branch/main state;
- Forge Enterprise Completion Skill;
- CFMAX source lock;
- current code/migrations/tests;
- official Cloudflare provider constraints;
- branch ownership.

Then choose the safest architecture consistent with repository evidence.

## Local blocker behavior

A local blocker is not a stop condition.

Worker must:

1. write a Dependency Request in branch-local handoff;
2. identify exact blocked subsection;
3. continue every independent audit/implementation/test/documentation slice;
4. leave interfaces/fixtures/tests that make convergence deterministic.

## Only valid stop conditions

A worker may ask the user only when:

1. a business/product choice materially changes authoritative behavior and cannot be inferred from repo/spec evidence;
2. a shared authoritative contract owned by another stream must change and cannot be isolated behind a seam;
3. a destructive/production action is required;
4. non-UI/shared/backend/schema/migration/security/infrastructure work is ready to merge/deploy and Forge policy requires explicit approval.

## Production prohibition during autonomous work

Without explicit user authorization workers must not:

- mutate production DNS;
- rotate/set production secrets;
- enable/disable production WAF/Access rules;
- perform D1 PITR;
- delete/suspend/migrate customer production data;
- deploy backend/shared-contract infrastructure changes;
- merge non-UI implementation merely because tests pass.

## Cloudflare-specific rule

A provider product page is not an instruction to adopt the product.

Every adoption requires:

- Forge capability outcome;
- current-state gap;
- authority boundary;
- tenant/security boundary;
- failure/recovery contract;
- performance/cost argument;
- acceptance evidence.

If those are absent, the correct worker output may be `DEFERRED` or `REJECTED`.
