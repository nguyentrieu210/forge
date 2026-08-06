# PILOT-UX-E2E Evidence Index

This directory is the durable index for operator E2E evidence references. Large Playwright traces, screenshots and videos should normally live as CI/workflow artifacts rather than binary Git history.

Each accepted evidence entry must point to an `E2E_EVIDENCE_CONTRACT.md`-compatible manifest and identify:

- flow ID;
- result;
- source/deployed/package identity;
- environment class;
- persona;
- workflow/run/artifact reference;
- execution timestamp;
- failure class/severity when not PASS;
- mutation classification;
- evidence freshness.

Do not place passwords, session cookies, tokens, secrets or unnecessary sensitive customer payloads in evidence records.

## Current evidence

No execution evidence has yet been accepted under the PILOT-UX-E2E contract. Existing historical/ad-hoc browser evidence may be linked for diagnosis but does not automatically establish current operator-flow PASS.
