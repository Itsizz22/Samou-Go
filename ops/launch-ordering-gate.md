# October 2026 launch gate

Authorized launch: **2026-10-03 13:00 Asia/Hebron (10:00 UTC)**.

`node ops/launch-ordering-gate.cjs pause` saves original store acceptance flags
in `ops_launch_gate`, then disables acceptance without changing store visibility,
products, approval, or existing orders. PostgreSQL triggers prevent new ordinary
orders and custom requests before launch, including clients that bypass UI checks.
A store trigger prevents managers or newly created stores from enabling orders
before launch. No API or mobile release is required for enforcement.

`node ops/launch-ordering-gate.cjs verify` checks rejection of incomplete inserts;
no test orders are created. `status` reports the gate and store counts.

`node ops/launch-ordering-gate.cjs resume` refuses to run before the stored launch
time, restores the saved acceptance flags, and removes the three temporary triggers
atomically. Repeated resume calls are safe. Previously closed stores remain closed.
Stores created during the pause were not in the snapshot and remain closed until
their manager enables them after launch. Keep the gate row as an audit record.

GitHub Actions `launch-ordering.yml` schedules restoration with retries, using the
existing production DATABASE_URL secret. A Codex heartbeat provides a second
restoration path. Schedulers can be delayed: verify the resume result at launch.
The database rejects early orders independently of either scheduler. Until resume
runs, the original stores remain unavailable even after the launch timestamp.

Old clients normally receive the existing STORE_CLOSED response. A direct bypass
of availability or a custom-request path is also blocked by PostgreSQL and can
surface a generic request failure on older server versions. Browsing remains open.
