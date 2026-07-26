# API Map — Native CloudForge v1

## Conventions
- Base `/api/v1`; tenant resolved from host/token, never client-controlled header alone.
- Every mutation accepts `Idempotency-Key`; document update accepts `If-Match` version.
- Errors: `{error_code,message,field_errors,correlation_id,evidence_id,retryable}`.
- Cursor pagination; filters use typed AST, not raw SQL.

| Method | Endpoint | Purpose | Core enforcement |
|---|---|---|---|
| POST | `/auth/login` | session login | rate limit/MFA/lockout |
| GET | `/boot` | user, roles, apps, workspaces, defaults, capabilities | session + tenant |
| GET | `/meta/doctypes/:name` | normalized schema bundle | read/meta permission |
| GET/POST | `/documents/:doctype` | list/create | row/create policy + query budget |
| GET/PATCH/DELETE | `/documents/:doctype/:name` | read/update/delete | row/field/action + version |
| POST | `/documents/:doctype/:name/actions/:action` | submit/cancel/amend/workflow/custom | lifecycle/action policy |
| POST | `/queries/run` | list/report/BI query AST | source ACL + budget |
| POST | `/files/initiate|complete` | signed upload lifecycle | file/document permission |
| GET | `/documents/:doctype/:name/timeline` | audit/comments/assignments | read policy |
| POST | `/imports` | import job | import policy + idempotency |
| GET | `/jobs/:id` | job state/log/result | job scope |
| POST | `/workflows/:name/apply` | workflow transition | state/role/condition |
| POST | `/reports/:name/run` | report execution/prepared job | report permission/budget |
| POST | `/print/:doctype/:name` | PDF/HTML print | print + field mask |
| GET/POST | `/builders/*` | authoring schema/workflow/print/dashboard | author permission + publish gate |
| GET/POST | `/platform/parity/*` | source scan/evidence/release | platform role |
