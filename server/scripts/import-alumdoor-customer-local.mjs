#!/usr/bin/env node
// Thin compatibility entrypoint. Customer mutation authority lives in the canonical local runner layer.
await import('../../scripts/local-runner/customer-import-core.mjs');
