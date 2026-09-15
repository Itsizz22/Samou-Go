# Private PostgreSQL backups on Vercel

The production backup workflow runs daily at 02:17 UTC and can also be run manually in GitHub Actions. Storage is a dedicated **private** Vercel Blob store. Firebase still handles notifications.

## Configuration

Repository `Itsizz22/Samou-Go` requires:

- Existing `DATABASE_URL` Actions secret (used only by the dump step).
- `BACKUP_BLOB_READ_WRITE_TOKEN` Actions secret, scoped to the dedicated backup store.
- `BACKUP_ENABLED=true` Actions variable.

Do not connect this store to client uploads or expose its token through `VITE_*` variables. Do not change the store to Public.

## Verification and retention

Each run creates a read-only PostgreSQL custom dump, uploads privately, downloads it with authentication and compares SHA-256. It then downloads the uploaded snapshot again and restores it into a fresh PostgreSQL 18 service container on the GitHub runner. The restore target is fixed to localhost and requires an empty database. Production credentials are not provided to the restore step.

After a successful restore, retain the seven newest matching snapshots under `backups/postgres/`. Unrelated paths and the current verified snapshot are excluded from deletion. Failed restore runs do not prune earlier backups. The status marker records upload verification; the GitHub run must also pass the restore step for full success.

The current snapshot is approximately 80 MB. Seven snapshots fit within the store's displayed 1 GB allowance today, but database growth and other usage can change that. A failed run must be investigated; storage allowance is not a fixed price guarantee.

## Operating the backup

Open Actions → Production backup → Run workflow on `master` for a manual backup. Review both “Snapshot and upload privately” and “Restore uploaded backup in isolated disposable database”. Repository failure notifications depend on the owner's GitHub notification settings; actual alert receipt needs verification.

Set `BACKUP_ENABLED=false` to pause the schedule without deleting stored backups. Never restore directly over production for a drill. For an incident, download an authenticated snapshot into a separate database, validate business records, then approve a specific recovery/cutover plan.

The workflow is an off-device backup and restore check, not a full application disaster-recovery exercise. It does not guarantee physical-device push delivery, infrastructure recreation, or media stored outside PostgreSQL.

## First live verification — 2026-09-15

- Run: https://github.com/Itsizz22/Samou-Go/actions/runs/34998460198
- Result: succeeded in 59 seconds on commit `3ebd63c`.
- Private upload: 79,291,011 bytes; authenticated SHA-256 readback matched.
- Off-device restore: 39 tables restored successfully in the isolated GitHub service container.
- Retention: 1 snapshot retained, 0 removed. Seven-snapshot retention is enabled.
- Daily schedule enabled using `BACKUP_ENABLED=true`.
- Nonblocking runner warning: the repository's pinned checkout/setup-node actions target Node 20 and GitHub runs them on Node 24. Both steps completed successfully.
