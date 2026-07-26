# Platform Workflow Bridge

Cloudflare Workflows không hỗ trợ deploy trong Workers for Platforms namespace. Vì vậy custom tenant code không gọi Workflow binding trực tiếp.

## Command

```json
{
  "tenant_id": "t1",
  "workflow_type": "large_import",
  "command_id": "uuid",
  "actor": "user@example.com",
  "capability": "workflow.start:large_import",
  "input_ref": "r2://signed-object",
  "callback": "tenant-command:import.apply-result",
  "deadline": "..."
}
```

## Controls

- Signature created by tenant Worker service binding.
- Platform verifies tenant release, capability, quota and callback allowlist.
- Workflow steps never hold user secrets in plain logs.
- Callback is a new idempotent command, not a direct database write.
- Cancel/pause/resume policy declared per workflow type.
- Workflow state visible in tenant Job Monitor with redacted internals.
