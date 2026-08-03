# Alumdoor admin credential reset — 2026-08-03

Scope: production tenant `alu` only.

Reason: operator reported the Alumdoor admin password had been changed and explicitly requested resetting it to the password already stored in the GitHub production secret `FORGE_ADMIN_PASSWORD`.

Implementation:
- reset only an existing admin user; do not create a second account;
- desired password is read from GitHub Actions secret only and never written to repository content or logs;
- update the remote `cloudforge-alu` D1 user row;
- force `enabled=1`;
- increment `session_epoch` so every earlier session is revoked;
- verify the new credential against `https://alu.kairo.vn/api/method/login`;
- publish a classic commit status `alu-admin-password-reset` so the production result can be checked even though the connector cannot list push-triggered workflow runs.

The requested password value itself is intentionally not recorded here.
