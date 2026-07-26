# Offline & Realtime Contract

Offline cache stores encrypted user-scoped allowed documents/meta and mutation outbox. Sync uses cursor and idempotency; conflict options show local/server diff. Presence/locks/update notifications use per-document Durable Object rooms. Realtime never bypasses canonical document API; events carry document version and require refetch on gap.
