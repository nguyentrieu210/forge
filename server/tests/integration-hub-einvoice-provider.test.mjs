import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalEvidencePatch,
  deriveEInvoiceIdempotencyKey,
  executeEInvoiceProviderOperation,
  signHmacEInvoiceCallback,
  verifyHmacEInvoiceCallback,
} from "../dist/packages/integration-hub/src/einvoice-provider.js";

const authority = {
  schema_version: 1,
  tenant_id: "demo",
  submission_name: "EINV-00001",
  provider: "mock-einvoice",
  company: "ACME",
  source_doctype: "Sales Invoice",
  source_name: "SINV-00001",
  source_version: 3,
  operation_type: "Original",
  posting_at: "2026-08-04T00:00:00.000Z",
  payload: { invoice_no: "SINV-00001", total_minor: 125000, currency: "VND" },
};

const adapter = {
  provider_key: "mock-einvoice",
  buildRequest({ operation, authority: input }) {
    if (operation === "status_sync") return { method: "GET" };
    return {
      method: "POST",
      content_type: "application/json; charset=utf-8",
      body: JSON.stringify(input.payload),
      headers: { "x-provider-contract": "v1" },
    };
  },
  async parseResponse({ body }) {
    return JSON.parse(body);
  },
};

const credentialResolver = {
  async resolve() {
    return { headers: { authorization: "Bearer provider-secret-token" } };
  },
};

const signer = {
  async sign() {
    return {
      headers: { "x-provider-signature": "signature-value" },
      signature_reference: "kms://einvoice/cert-v1",
    };
  },
};

function transport(status, body, extraHeaders = {}) {
  return {
    async fetch(_url, init) {
      return new Response(body, { status, headers: { "content-type": "application/json", ...extraHeaders } });
    },
  };
}

test("e-invoice transport returns canonical Finance evidence patch without persisting provider secrets", async () => {
  const result = await executeEInvoiceProviderOperation({
    operation: "submit",
    authority,
    target_url: "https://einvoice.example.com/api/submit",
    allowed_hosts: ["einvoice.example.com"],
    credential_ref: "credential://einvoice/mock",
    adapter,
    credential_resolver: credentialResolver,
    signer,
    transport: transport(200, JSON.stringify({
      status: "Accepted",
      external_reference: "provider-123",
      tax_authority_reference: "tax-456",
      provider_code: "OK",
      response_message: "Accepted",
      evidence: { processing_state: "accepted", receipt_id: "receipt-1" },
    })),
    attempt: 1,
    now: new Date("2026-08-04T01:00:00.000Z"),
  });

  assert.equal(result.decision.action, "delivered");
  assert.equal(result.evidence_patch.submission_status, "Accepted");
  assert.match(result.evidence_patch.payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(result.evidence_patch.external_reference, "provider-123");
  assert.equal(result.evidence_patch.tax_authority_reference, "tax-456");
  assert.equal(result.evidence_patch.signature_reference, "kms://einvoice/cert-v1");
  const evidence = JSON.parse(result.evidence_patch.response_evidence_json);
  assert.equal(evidence.provider, "mock-einvoice");
  assert.equal(evidence.http_status, 200);
  assert.equal(evidence.idempotency_key, result.idempotency_key);
  assert.match(evidence.request_hash, /^[0-9a-f]{64}$/);
  assert.match(evidence.response_hash, /^[0-9a-f]{64}$/);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("provider-secret-token"), false);
  assert.equal(serialized.includes("signature-value"), false);
});

test("e-invoice submit identity is deterministic and status sync binds the canonical provider reference", async () => {
  const first = await executeEInvoiceProviderOperation({
    operation: "submit",
    authority,
    target_url: "https://einvoice.example.com/api/submit",
    allowed_hosts: ["einvoice.example.com"],
    credential_ref: "credential://einvoice/mock",
    adapter,
    credential_resolver: credentialResolver,
    transport: transport(200, JSON.stringify({ status: "Submitted", external_reference: "provider-123" })),
    attempt: 1,
  });
  const second = await executeEInvoiceProviderOperation({
    operation: "submit",
    authority,
    target_url: "https://einvoice.example.com/api/submit",
    allowed_hosts: ["einvoice.example.com"],
    credential_ref: "credential://einvoice/mock",
    adapter,
    credential_resolver: credentialResolver,
    transport: transport(200, JSON.stringify({ status: "Submitted", external_reference: "provider-123" })),
    attempt: 1,
  });
  assert.equal(first.idempotency_key, second.idempotency_key);
  assert.equal(first.canonical_payload_hash, second.canonical_payload_hash);

  const statusAuthority = {
    ...authority,
    payload_hash: first.canonical_payload_hash,
    external_reference: "provider-123",
  };
  const syncId = await deriveEInvoiceIdempotencyKey("status_sync", statusAuthority, first.canonical_payload_hash);
  const sync = await executeEInvoiceProviderOperation({
    operation: "status_sync",
    authority: statusAuthority,
    target_url: "https://einvoice.example.com/api/status/provider-123",
    allowed_hosts: ["einvoice.example.com"],
    credential_ref: "credential://einvoice/mock",
    adapter,
    credential_resolver: credentialResolver,
    transport: transport(200, JSON.stringify({ status: "Accepted", external_reference: "provider-123" })),
    attempt: 1,
  });
  assert.equal(sync.idempotency_key, syncId);
  assert.equal(sync.evidence_patch.payload_hash, first.canonical_payload_hash);
});

test("provider retry and redirect failures do not manufacture canonical status evidence", async () => {
  const retry = await executeEInvoiceProviderOperation({
    operation: "submit",
    authority,
    target_url: "https://einvoice.example.com/api/submit",
    allowed_hosts: ["einvoice.example.com"],
    credential_ref: "credential://einvoice/mock",
    adapter,
    credential_resolver: credentialResolver,
    transport: transport(503, JSON.stringify({ status: "Rejected", provider_code: "TEMP" })),
    attempt: 1,
  });
  assert.equal(retry.decision.action, "retry");
  assert.equal(retry.evidence_patch, undefined);

  const redirect = await executeEInvoiceProviderOperation({
    operation: "submit",
    authority,
    target_url: "https://einvoice.example.com/api/submit",
    allowed_hosts: ["einvoice.example.com"],
    credential_ref: "credential://einvoice/mock",
    adapter,
    credential_resolver: credentialResolver,
    transport: transport(302, ""),
    attempt: 1,
  });
  assert.equal(redirect.decision.action, "dead_letter");
  assert.equal(redirect.evidence_patch, undefined);
});

test("credential and provider evidence boundaries reject authority-header override and secret material", async () => {
  await assert.rejects(
    executeEInvoiceProviderOperation({
      operation: "submit",
      authority,
      target_url: "https://einvoice.example.com/api/submit",
      allowed_hosts: ["einvoice.example.com"],
      credential_ref: "credential://einvoice/mock",
      adapter,
      credential_resolver: {
        async resolve() {
          return { headers: { "x-cloudforge-einvoice-idempotency-key": "forged" } };
        },
      },
      transport: transport(200, JSON.stringify({ status: "Accepted" })),
      attempt: 1,
    }),
    /protected e-invoice header/,
  );

  await assert.rejects(
    buildCanonicalEvidencePatch({
      operation: "submit",
      authority,
      provider_result: { status: "Accepted", evidence: { access_token: "secret" } },
      canonical_payload_hash: "a".repeat(64),
      request_hash: "b".repeat(64),
      response_body: "{}",
      http_status: 200,
      idempotency_key: "ein_test",
      observed_at: "2026-08-04T01:00:00.000Z",
    }),
    /Credential material is forbidden/,
  );
});

test("timestamped HMAC callback verification rejects forgery and replay outside allowed skew", async () => {
  const secret = "callback-secret-material-123456";
  const timestamp = "2026-08-04T02:00:00.000Z";
  const rawBody = JSON.stringify({ submission: "EINV-00001", status: "Accepted" });
  const signature = await signHmacEInvoiceCallback(secret, timestamp, rawBody);
  const verified = await verifyHmacEInvoiceCallback({
    tenant_id: "demo",
    provider: "mock-einvoice",
    submission_name: "EINV-00001",
    raw_body: rawBody,
    timestamp,
    signature,
    secret,
    now: new Date("2026-08-04T02:03:00.000Z"),
  });
  assert.match(verified.callback_id, /^eicb_[0-9a-f]{48}$/);
  assert.match(verified.payload_hash, /^[0-9a-f]{64}$/);

  await assert.rejects(
    verifyHmacEInvoiceCallback({
      tenant_id: "demo",
      provider: "mock-einvoice",
      submission_name: "EINV-00001",
      raw_body: rawBody,
      timestamp,
      signature: `sha256=${"0".repeat(64)}`,
      secret,
      now: new Date("2026-08-04T02:03:00.000Z"),
    }),
    /Invalid e-invoice callback signature/,
  );
  await assert.rejects(
    verifyHmacEInvoiceCallback({
      tenant_id: "demo",
      provider: "mock-einvoice",
      submission_name: "EINV-00001",
      raw_body: rawBody,
      timestamp,
      signature,
      secret,
      now: new Date("2026-08-04T02:10:01.000Z"),
      max_skew_seconds: 300,
    }),
    /outside the allowed skew/,
  );
});
