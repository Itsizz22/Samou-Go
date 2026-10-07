# Automatic store opening and closing

Store hours use Asia/Hebron. The API already returns CLOSED and rejects immediate orders outside the configured hours, including overnight shifts. This enforcement does not wait for a scheduler tick.

`store-opening-windows.sql` adds automatic reopening once per local work shift to the existing 30-second daily-ordering scheduler. A new store or changed schedule is picked up automatically. Manual closure during a shift is respected until the next shift. The separate `isAcceptingOrders` pause is never changed by this function. Shops without both valid times are not scheduled; equal times mean 24 hours.

Install from the repository root with the production Prisma client generated and DATABASE_URL supplied in the environment:

    node ops/install-store-opening-windows.cjs

Installation is transactional and idempotent. It requires the existing `samou_sync_daily_ordering_banner()` function. If that function is replaced by maintenance, rerun this installer to retain its opening hook.

Verified on 2026-10-08: exact opening/closing boundaries, overnight closing, winter timezone, reopening next day, preserving a same-shift manual closure, and preserving the order acceptance pause. All simulated store changes were rolled back before installation.
