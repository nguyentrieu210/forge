# Security & Threat Model

Assets: tenant data, financial/HR PII, credentials, scripts, audit, exports. Threats: tenant confusion, policy bypass, IDOR, field leakage, injection, malicious custom code, webhook replay, queue duplicate, report exfiltration, poisoned files, admin abuse.

Controls: host/token tenant binding; server policy compiler; typed query AST; field projection/masking; CSRF/origin; secure cookies; secret vault; signed webhook/idempotency; Workers for Platforms isolation; R2 signed URLs/virus pipeline; immutable audit; least privilege service principals; export/legal hold logs; dependency/SBOM/signature gates.
