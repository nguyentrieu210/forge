# Forge project delivery

This repository uses GitHub as the source of truth. Read `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, and `DELIVERY_POLICY.md` before changing code.

- Work on task branches and exact SHAs.
- Required CI must pass before merge.
- Production delivery follows `DELIVERY_POLICY.md`.
- Never commit secrets, `.env`, `server/work/`, `tmp/`, backups, or generated evidence.
- Do not change DNS, production secrets, irreversible data state, or FIFO without explicit authorization.
