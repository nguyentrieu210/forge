# Dependency Request — PR #772 release-safety convergence gate

Date: 2026-08-06
PR: #772 `fix(alumdoor): stabilize sales autofill and autocalc`
Owner needed: release/SRE governance

## Blocker

The R6 Pass Convergence run reached `Verify release safety authority` after successfully completing:

- locked dependency install;
- exact CloudForge build;
- converged Alumdoor sales/procurement contract verification;
- app report aggregate checks;
- exact MetaForge build;
- migration / restore / PITR safety;
- workerd ERP lifecycle;
- auth / CSRF / tenant isolation;
- tenant provisioning;
- R6 Golden Flow and its assertion.

The release-safety step then failed and downstream release checks were skipped.

## Why this is a separate dependency

PR #772 does not modify `.github/workflows/alu-build-deploy.yml` or `server/scripts/verify-release-safety.mjs`; those are the canonical inputs to the failing verifier. The Sales Sheet workstream must not weaken or bypass release governance to make its PR green.

## Request

Release/SRE owner should reproduce the exact failing invariant on current `main`, reconcile the canonical workflow and verifier if they have drifted, and preserve all production mutation/backup/merged-main/security gates.

## Independent work that remains valid

Sales Sheet source audit, exact builds, domain-contract checks, Golden Flow, UI layout changes, read-only Item Price context ordering and regression source evidence can continue independently. Merge/deploy remains blocked until the required convergence evidence is clean or the release owner classifies the gate with authoritative evidence.
