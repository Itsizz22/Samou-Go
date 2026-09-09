# Multi-store captain assignments

Admin users and captains panels, captain creation, and the store quick-assignment
action support multiple stores. Save the full selection atomically. The store
quick action adds its store without replacing the captain's existing selection.
An empty selection means the existing shared/general captain pool.

`PublicUser.assignedStoreIds` is authoritative for new clients. `assignedStoreId`
remains as the first assigned store for old clients. Legacy one-store writes
replace the full selection; explicit `assignedStoreIds` takes precedence if both
fields are sent. Moving a user to a non-captain role or deactivating via driver
delete clears assignments. Only admin endpoints can alter assignments.

Both Prisma schemas use the indexed many-to-many `MultiStoreCaptains` relation.
The production migration backfills every existing non-null assignment and keeps
the original column and FK. Generate both clients and apply the production
migration before deploying the new API. Do not delete existing memberships or
seed production. Local schema generation alone does not migrate a local dev.db.

Order visibility, reservations, pickup, manual assignment and preparation/ready
recipients honor all assigned stores. Stores with dedicated captains retain their
existing exclusive-pool rule. Assigned active jobs remain visible to their captain
even if admin later removes the store. New-order and manager catalogue queries use
the same many-to-many relation, so a second store includes its assigned captains.

Regression tests cover two assigned stores plus an excluded third store, recipient
eligibility, pickup from the second store, role restrictions, invalid store IDs,
empty selection, general captain creation, legacy edits and idempotent backfill.
